---
title: "Presigned URLs Are Temporary Credentials"
date: "2026-10-26"
updated: "2026-10-26"
slug: "presigned-urls-are-temporary-credentials"
description: "A presigned download URL is not harmless response metadata. Whoever possesses it can use the delegated access until it expires, so agent tools should issue it only to the intended recipient."
summary: "Treat presigned URLs as bearer credentials: authorize issuance, keep them out of broad tool outputs and telemetry, bound their lifetime and resource, and include them in revocation and deletion guarantees."
tags: [ai agents, security, api design, developer tooling, reliability]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/presigned-urls-are-temporary-credentials/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

A presigned URL is a temporary bearer credential embedded in a URL. It is useful when the intended recipient needs to transfer an object directly to or from storage. It is unsafe to treat as ordinary file metadata in an agent tool response, support ticket, trace, or model context.

Authorize the *issuance* of a URL for a specific recipient and operation. Keep the URL's method, object, response shape, and lifetime narrow. Return a stable document reference or bounded content to an agent that does not need to download the object itself. Count already-issued URLs in the time it takes a permission change, deletion, or emergency restriction to become effective.

## Context

An internal support agent is asked to summarize a customer's contract. Its `documents.get` tool returns this:

```json
{
  "documentId": "doc_482",
  "name": "Acme-renewal.pdf",
  "downloadUrl": "https://storage.example/...&X-Amz-Signature=..."
}
```

The agent does not need the URL to answer the question, but it may quote it in a ticket, leave it in a trace, send it to another tool, or surface it to a user who can see the conversation but is not permitted to download the contract. Each of those is an access decision—not a formatting detail.

Cloud Storage makes the capability explicit: anyone who possesses an active signed URL can use the specified access, whether or not they have a valid account. The URL contains authentication information in its query string. [Google Cloud's signed-URL documentation](https://cloud.google.com/storage/docs/access-control/signed-urls) describes it as time-limited permission to make a request. AWS describes an S3 presigned request similarly: an authorized principal creates a request signed in advance, then shares the ability to perform that request. [AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/presigned-url-best-practices/introduction.html)

That makes a useful mental model simple: a presigned URL is not a link *to* access. It is access for a bounded interval.

## Key Points

### A resource identifier and a bearer capability belong in different fields

`doc_482` tells a service which document is being discussed. It should not, by itself, confer access. A URL with a valid signature can confer access to an object even if the storage service has no idea who clicked it.

The distinction matters because a tool result often travels farther than its caller:

- model context may be retained, evaluated, or shown to an operator;
- traces and logs may be accessible to a larger engineering group;
- a downstream agent may have different authority than its parent; and
- a chat participant may be allowed to know that a file exists without being allowed to receive it.

Do not solve this by hiding the URL in an opaque `metadata` object. The capability is still present. Return a durable reference, content classification, and a small preview by default; issue the bearer URL only from an endpoint whose recipient and intended transfer are known.

```ts
type DocumentLookup = {
  documentId: string;
  name: string;
  classification: "internal" | "restricted";
  excerpt?: string;
  // Deliberately no downloadUrl.
};

type DownloadGrant = {
  documentId: string;
  expiresAt: string;
  url: string; // Sent only to the authorized download client.
};
```

The types are illustrative. The important boundary is that a general document lookup does not accidentally become a credential-minting API.

### Re-authorize when issuing the URL, not only when listing the file

It is common to check access when a user lists documents, then generate a long-lived URL later from a worker or a generic download helper. That turns an old, broad observation into a fresh capability.

Instead, treat `createDownloadGrant(doc_482)` as a security-sensitive operation. At issuance time, verify the current principal, tenant, object-level policy, and any purpose or approval the application requires. OWASP's REST assessment guidance recommends testing object-level authorization against identifiers a user can already observe; a list entry or notification is not evidence that every subsequent object operation is authorized. [OWASP REST Assessment Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Assessment_Cheat_Sheet.html)

This is especially important for an agent. A planner may legitimately learn that a contract exists. A download worker, a child agent, and a person reading its transcript do not automatically inherit the right to fetch it. [Delegation Should Shrink Authority](https://my-slops.github.io/Blog/posts/2026/10/delegation-should-shrink-authority/) covers the broader rule: routing a task is not a reason to forward a broad credential.

### Make the delegated request as small as the task

Expiration is only one dimension. A safer issuance policy also constrains what request the URL can authorize:

| Constraint | Why it matters |
| --- | --- |
| One object or narrowly defined prefix | Prevents a single capability from becoming a collection export. |
| `GET` versus `PUT` | A download grant and an upload grant have different failure modes. |
| Short lifetime matched to the transfer | Limits the period in which an accidental copy can be used. |
| Signed response headers where supported | Prevents a caller from changing an intended content disposition or response behavior. |
| Recipient-specific delivery path | Keeps the grant out of shared tool transcripts and broad logs. |

The storage provider sets real constraints. For example, S3 Signature Version 4 records the allowed lifetime and the headers used in signature calculation; a URL can remain valid for up to seven days under its signing-key rules. [AWS's query-string authentication reference](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html) also recommends signing planned headers. Google Cloud's V4 signed URLs bind the request and include an expiry value. Those mechanics are helpful, but they cannot decide whether an agent should have received the URL in the first place.

For large browser downloads, direct storage access can be exactly the right design. It avoids proxying a multi-gigabyte file through an application server. The point is not to eliminate presigned URLs; it is to send one directly to the authorized browser at the moment it needs it, rather than let it become general-purpose tool output.

### Treat URL-bearing logs as credential handling

Many URL redaction rules remove names such as `Authorization` or `Cookie` from headers but preserve full request URLs. That is insufficient when the signature, credential scope, and expiry live in the query string.

At a minimum, logging and tracing code should record a stable grant ID, object class, requested method, expiration, and issuer decision—not the complete URL. If a diagnostic system must preserve a sample, store a redacted form that cannot be reassembled into a request. Avoid copying these URLs into exception messages, analytics events, issue attachments, or model-evaluation fixtures.

AWS explicitly calls out logging interactions as part of its presigned-URL guidance, including precautions to limit information available through logs. [AWS guardrails and monitoring guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/presigned-url-best-practices/introduction.html) is a useful reminder that creating the grant and observing its use are separate control problems.

### Revocation has to include grants already issued

An authorization change can stop new URL creation immediately and still leave a previously issued URL usable until it expires, subject to the storage system's applicable credential and policy behavior. A five-minute URL may be acceptable for an interactive download; a seven-day URL is a seven-day residual access path unless another control invalidates it.

This does not mean every URL needs a bespoke revocation database. It means the URL lifetime belongs in the access promise. If a system says that removing someone from a project takes effect within two minutes, it cannot quietly hand out fifteen-minute bearer downloads unless the residual access is acceptable or there is a tested invalidation path.

The same inventory applies to deletion. Block new grants first, then account for active grants, object replicas, previews, and caches. [Deletion Is a Propagation Problem](https://my-slops.github.io/Blog/posts/2026/10/deletion-is-a-propagation-problem/) and [Revocation Is a Latency Requirement](https://my-slops.github.io/Blog/posts/2026/10/revocation-is-a-latency-requirement/) explain why a source-of-truth change is not, by itself, a completed access guarantee.

## Steps / Code

Review every presigned-URL flow with this sequence:

1. Identify every response, event, log, trace, or queue payload that can contain a signed URL or upload session URI.
2. Split object lookup from grant issuance. The lookup returns a stable object ID and bounded preview; issuance performs a fresh object-level authorization check.
3. At issuance, bind the object, HTTP method, expiry, tenant, and intended client path as tightly as the storage provider allows.
4. Deliver the URL only to the client that needs direct transfer. Do not send it through an agent transcript merely because an agent coordinated the request.
5. Redact query-string credentials before logs, telemetry, support attachments, and eval fixtures leave the request boundary.
6. Test two tenants, two roles, an expired grant, a revoked user, and a copied URL. The last case should prove exactly what your system promises—not what you hope an expiry will prevent.

For a support-agent tool, a safer interface is often:

```text
documents.summarize(documentId) -> bounded text, classification, source reference
documents.request_download(documentId) -> hand off to an authorized user's browser
```

The agent can help decide whether a document is relevant without receiving a credential that lets it export the complete object.

## Trade-offs

Separating lookup from grant issuance adds another endpoint or handoff, and a very short lifetime can make slow downloads or disconnected clients frustrating. A proxy that re-checks authorization on every byte may also be prohibitively expensive for large files.

Those are reasons to tune the grant to the transfer, not reasons to flatten the distinction. Direct browser-to-storage downloads remain a good use for a presigned URL when the browser is the intended bearer and the lifetime is appropriate. An internal operations script may also reasonably receive one if it has a controlled credential channel and a concrete job.

The conservative cases are shared agent transcripts, external tickets, broad observability systems, and tools callable by several principals. In those places, a signed URL is far more powerful than the surrounding object metadata, so it deserves a stricter contract.

## References

- Google Cloud, [Signed URLs](https://cloud.google.com/storage/docs/access-control/signed-urls)
- AWS, [Authenticating Requests: Using Query Parameters (AWS Signature Version 4)](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html)
- AWS Prescriptive Guidance, [Establishing guardrails and monitoring for presigned URLs](https://docs.aws.amazon.com/prescriptive-guidance/latest/presigned-url-best-practices/introduction.html)
- OWASP, [REST Assessment Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Assessment_Cheat_Sheet.html)
- This repository, [Delegation Should Shrink Authority](https://my-slops.github.io/Blog/posts/2026/10/delegation-should-shrink-authority/)
- This repository, [Revocation Is a Latency Requirement](https://my-slops.github.io/Blog/posts/2026/10/revocation-is-a-latency-requirement/)

## Final Take

The word “URL” can make a powerful capability look like harmless metadata. Do not let the data shape decide the security model.

A presigned URL is a delegated, time-bounded request. Issue it to the intended bearer, keep it out of general agent output, and make its remaining lifetime part of the system's honest answer about access and revocation.

## Changelog

- 2026-10-26: Initial publication on treating presigned URLs as bearer credentials in agent tool contracts.
