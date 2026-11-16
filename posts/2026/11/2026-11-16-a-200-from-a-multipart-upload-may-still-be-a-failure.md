---
title: "A 200 From a Multipart Upload May Still Be a Failure"
date: "2026-11-16"
updated: "2026-11-16"
slug: "a-200-from-a-multipart-upload-may-still-be-a-failure"
description: "Amazon S3 can send the HTTP 200 for CompleteMultipartUpload before it knows the final result. Do not make a file visible because headers arrived; wait for and validate the terminal response body."
summary: "A multipart upload is not complete when its HTTP status line says 200. On S3, the final body can still be an error after the initial success header, so application state must advance only after the completion result is parsed and its integrity contract is understood."
tags: [storage, API design, reliability, distributed systems, developer tooling]
author: "vabs"
status: published
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/a-200-from-a-multipart-upload-may-still-be-a-failure/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

For Amazon S3's `CompleteMultipartUpload`, an HTTP `200 OK` is not always the completion result. S3 can send the response headers while it is still assembling the object, then place an XML `<Error>` in the body if that work fails. A client that decides "the file exists" after reading only the status line can mark an upload ready when no completed object exists.

Treat multipart completion as a terminal protocol result, not a successful transport handshake. Prefer an AWS SDK that parses the body and surfaces an embedded error. If an application calls the API directly, it must consume and parse the entire body before it writes a database attachment, emits an "upload complete" event, or exposes the object to another user.

The larger lesson applies beyond S3: a response can acknowledge that a service has begun processing without proving the effect your application cares about. Make the local state transition follow the provider's real completion boundary.

## Headers can arrive before the answer

Multipart upload is deliberately split into stages. A client creates an upload, sends independently retriable parts, and asks S3 to assemble a chosen list of parts. The last request is not merely a small metadata update: S3 has to validate the supplied part list and create the combined object.

That creates an unusual wire-level behavior for `CompleteMultipartUpload`. AWS documents that, after S3 begins processing the request, it sends a `200 OK` header and may send whitespace while work continues. The operation can then fail; the same `200 OK` response body can contain an `<Error>` element rather than a `CompleteMultipartUploadResult`. [AWS's API reference shows the embedded-error response](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html). Its Boto3 reference makes the operational consequence explicit: a direct caller must parse the response contents, while AWS SDKs detect this condition and apply their normal error handling. [Boto3 `complete_multipart_upload`](https://docs.aws.amazon.com/boto3/latest/reference/services/s3/client/complete_multipart_upload.html)

So this implementation is wrong even though its status check is conventional:

```ts
const response = await rawHttp.completeMultipartUpload(request);

if (response.status === 200) {
  await db.file.update({
    where: { id: fileId },
    data: { state: "ready", objectKey },
  });
}
```

It treats a preliminary signal as a terminal result. If the body later says `InternalError`, the database now contains a ready file that the object store never completed. Downstream image processing, virus scanning, or a download request will discover the discrepancy later, far from the actual failure.

The important distinction is not that HTTP status codes are generally untrustworthy. They are normally the right first branch. It is that this documented operation has a completion protocol whose result is carried in more than the status line. A generic HTTP wrapper is not automatically a correct S3 multipart client.

## Let the provider client finish the protocol

The easiest safe design is usually to use a maintained AWS SDK and await its completion operation. The SDK knows that this API can encode a late failure in a nominally successful HTTP response and turns that condition into its normal error path.

```ts
import {
  CompleteMultipartUploadCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const result = await s3.send(new CompleteMultipartUploadCommand({
  Bucket: bucket,
  Key: objectKey,
  UploadId: uploadId,
  MultipartUpload: { Parts: completedParts },
}));

// Reached only after the SDK accepted the final protocol result.
await markUploadReady({
  fileId,
  objectKey,
  versionId: result.VersionId,
  etag: result.ETag,
});
```

This is illustrative TypeScript, not a complete upload service. In particular, `completedParts` must come from the acknowledged part uploads for this upload ID, and `markUploadReady` needs its own authorization and transactional design. But its ordering matters: no application-visible state advances merely because the HTTP headers arrived.

If a product has a good reason to call S3's REST API directly, its client needs the equivalent rule:

```text
send CompleteMultipartUpload
  → receive HTTP status and stream body
  → consume the complete body
  → parse XML
  → if root is Error: apply retry or reconciliation policy
  → if root is CompleteMultipartUploadResult: record the returned identity
  → only then transition the local upload to ready
```

Do not add a second `HEAD` request just to compensate for a client that ignored the completion body. Once a successful completion result has been parsed, an extra existence check is usually redundant. Conversely, a `HEAD` after an ambiguous or interrupted request is a reconciliation step, not proof that the original completion call succeeded: a reused key, a concurrent writer, or an earlier object at that key can make existence too weak an answer.

That last caveat is why an object key should be an immutable upload attempt or content identity when possible. A stable key such as `uploads/{fileId}/{uploadAttemptId}` gives reconciliation a specific object to inspect. Writing every attempt to a mutable `uploads/{fileId}/current` key leaves a timeout recovery path unable to tell which attempt produced what it found.

## Completion and integrity are separate promises

Even a successful `CompleteMultipartUpload` result does not mean every integrity question has been answered in the way an application assumes.

An S3 ETag identifies the created object, but AWS describes it as opaque and says it may or may not be an MD5 digest. For a multipart object, it is especially unsafe to treat the ETag as a portable checksum contract. [The `CompleteMultipartUpload` API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html) documents both points.

If an application needs to establish that the stored bytes are the bytes it intended to retain, choose and record an actual checksum contract at upload initiation. AWS supports checksum algorithms and distinguishes full-object from composite checksum behavior for multipart uploads. For a full-object checksum, S3 validates the supplied value during completion and fails the request with `BadDigest` if it does not match; it stores the verified checksum with the object. [AWS's object-integrity guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)

These are different questions:

| Question | Evidence that answers it |
| --- | --- |
| Did S3 finish this multipart operation? | A parsed `CompleteMultipartUploadResult`, not only HTTP 200. |
| Which object did that operation create? | The returned bucket, key, version identifier where applicable, and object metadata. |
| Did the intended full content arrive intact? | A checksum policy that was actually configured and validated, not a guessed interpretation of ETag. |
| Is the file acceptable to the product? | Application validation: size, media decoding, malware scan, ownership, and policy. |

The final row is intentionally outside S3's protocol. A checksum proves a byte relationship, not that a PDF is safe to display or that an uploaded CSV belongs to the account claiming it. Do not combine those lifecycle transitions into one vague `uploaded = true` bit.

## Give uploads states that match failure recovery

An upload record becomes much easier to operate when it represents the stages it actually crosses:

```ts
type UploadState =
  | "initiated"
  | "receiving_parts"
  | "completion_requested"
  | "completed"
  | "validating"
  | "ready"
  | "failed"
  | "needs_reconciliation";

type UploadRecord = {
  id: string;
  accountId: string;
  objectKey: string;
  uploadId: string;
  attemptId: string;
  state: UploadState;
  completionRequestId?: string;
  versionId?: string;
  checksum?: { algorithm: string; value: string };
  failureCode?: string;
};
```

The names are optional; the distinctions are not. `completion_requested` means a process has crossed a boundary whose outcome it may not learn immediately. `completed` means the storage provider's terminal result was accepted. `ready` means the application has performed whatever product-level validation is required. A crash between those states is a recovery case, not a reason to guess that the original caller's timeout means failure.

For example, an upload service could use this sequence:

1. Create a database record with an immutable object key and upload ID.
2. Receive and persist the acknowledged part metadata needed for completion.
3. Change the record to `completion_requested` before sending the final request.
4. Await the SDK result or fully parsed direct response.
5. Record the provider result and move to `completed` in one local transaction.
6. Run product validation, then move to `ready` and publish the attachment.

There is no global transaction across a database and S3. A crash after step 3 can leave the service unsure whether S3 completed the object; a crash after step 5 can leave a completed object not yet published. The point of the states is to make those cases discoverable. A reconciliation worker can inspect a bounded set of `completion_requested` records and decide whether to retry, query the expected immutable object, abort a still-open multipart upload, or ask for review.

This is closely related to [When a Commit and an Email Disagree](https://my-slops.github.io/Blog/posts/2026/10/when-a-commit-and-an-email-disagree/): one system cannot infer a second system's final effect from its own local write. Here, even the storage protocol's early header is not enough evidence. The application needs a durable record of the intended effect and the provider's actual terminal result.

## Do not leak incomplete uploads into the product

It is tempting to write the attachment row as soon as the browser has sent its final part. That makes a UI feel fast, and for most requests the last step will succeed. It also lets a failed completion masquerade as a real file.

Keep the provisional object private and inaccessible through normal attachment reads until its record is `ready`. This is more than a user-experience detail. A file that is referenced before completion can be indexed, scanned, transformed, billed, or shared by independent workers. Each worker now needs to rediscover the same half-finished condition.

The counterargument is valid for products that need immediate stream processing or collaborative upload progress. In that design, expose a deliberately provisional resource with explicit permissions and a state that consumers must honor. Do not call it an attachment, final export, or immutable evidence until it has crossed the completion boundary. The right model may be "a pending upload users can resume," not "a file that happens to be unreliable for a few seconds."

Incomplete multipart uploads also have operational cost. AWS notes that uploaded parts keep incurring storage charges until the upload is completed or aborted. [Multipart upload overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) Reconciliation therefore needs both correctness and cleanup: alert on old `completion_requested` records, expire abandoned client uploads on a documented schedule, and use an abort policy consistent with any user-resume promise.

## Test the response your HTTP helper hides

An upload test that only mocks a happy SDK result will not prove that application state waits for completion. Include the protocol boundary explicitly:

```text
Given: the completion endpoint sends HTTP 200 then an XML Error body
When: the multipart operation is finalized
Then: the application records a failure or reconciliation state
And: no attachment is visible

Given: an SDK reports a completion error after the final part upload
When: the API handler returns to the caller
Then: it does not create a ready attachment row

Given: the process dies after marking completion_requested
When: recovery runs
Then: it reconciles the recorded immutable key and upload ID
And: it never blindly creates a second visible attachment

Given: a checksum requirement is configured for an upload
When: the supplied full-object checksum does not match
Then: the object never reaches ready state
```

Also test the source of truth your own stack uses. A browser upload library, a reverse proxy, a custom fetch wrapper, and an SDK may each expose completion differently. The article's precise `200` behavior is specific to S3's multipart-completion API; other storage providers have different contracts. The general test is portable: what exact result proves the object your product intends to expose was created and accepted?

## Trade-offs

More states mean more recovery code and more ways to observe a stuck upload. Checksums consume CPU or require client support. Immutable object keys can make retention and cleanup less tidy than overwriting one familiar key. A provisional/private phase may delay availability by a scan or validation job.

Those costs are justified when a file becomes customer-visible, feeds a security-sensitive pipeline, or triggers expensive downstream work. For an internal scratch upload that can be safely retried and discarded, a simpler model may be enough—provided it still lets the system distinguish a successful completion from an unparsed HTTP response.

My preference is to make the product's visibility promise later than the storage protocol's ambiguous boundaries. The user can see an upload is in progress. Other systems should see a file only when the application can state what it knows about its completion, identity, and integrity.

## References

- Amazon S3, [CompleteMultipartUpload API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html)
- Boto3, [`complete_multipart_upload`](https://docs.aws.amazon.com/boto3/latest/reference/services/s3/client/complete_multipart_upload.html)
- Amazon S3, [Checking object integrity for data uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)
- Amazon S3, [Multipart upload overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- This repository, [When a Commit and an Email Disagree](https://my-slops.github.io/Blog/posts/2026/10/when-a-commit-and-an-email-disagree/)

## Final Take

`200 OK` can mean that a provider has accepted the next stage of work, not that the work has ended successfully. S3's multipart-completion response makes that distinction unusually visible.

Parse the terminal result. Keep the upload provisional until it passes the integrity and product checks that matter. And make crashes at that boundary recoverable from a durable record, not from optimism about a status line.

## Changelog

- 2026-11-16: Initial publication on multipart-completion response semantics and upload lifecycle boundaries.
