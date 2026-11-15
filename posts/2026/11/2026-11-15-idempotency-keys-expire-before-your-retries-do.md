---
title: "Idempotency Keys Expire Before Your Retries Do"
date: "2026-11-15"
updated: "2026-11-15"
slug: "idempotency-keys-expire-before-your-retries-do"
description: "An idempotency key prevents a duplicate effect only while the server retains the record that recognizes it. Make that retention window an explicit API contract, and give late recovery a durable operation lookup instead of a hopeful replay."
summary: "A deduplication record with a TTL is a time-bounded retry guarantee, not permanent exactly-once behavior. Publish the window, bind each key to its request, and require late callers to reconcile an operation rather than repeat an uncertain side effect."
tags: [api design, reliability, distributed systems, software architecture]
author: "vabs"
status: published
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/idempotency-keys-expire-before-your-retries-do/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

An idempotency key is not a permanent promise that an operation can happen only once. It is a promise that lasts only as long as the server retains the record that recognizes the key.

That distinction matters when a mobile client wakes after a long offline period, a queue is paused during an incident, or a human retries a request from an old support ticket. If the server has deleted the idempotency record, the same key may be indistinguishable from a new request. Replaying it can create a second charge, shipment, or account change.

Treat key retention as part of the endpoint contract. Publish how long a retry is safe, bind a key to one scoped request, and give callers a durable way to inspect the original operation when the retry window has passed. A key TTL is a garbage-collection policy with product consequences.

## The retry that arrived after the server forgot it

Suppose a client asks to create a shipment:

```http
POST /shipments
Idempotency-Key: "ship_7d1a"

{ "orderId": "ord_481", "service": "express" }
```

The API stores a record for `ship_7d1a`, creates the shipment, and returns a response. The response is lost on the way back to the client. For the next several hours, a retry can find that record and return the original result.

Now change only the timing:

```text
Monday 09:00   server creates shipment; client loses the response
Monday 09:05   client's device goes offline
Tuesday 15:00  retention task deletes old idempotency records
Thursday 09:00 device reconnects and retries ship_7d1a
```

At Thursday's request, the key is well formed, but it no longer identifies anything in the server's deduplication table. Processing it as a new request is not necessarily an implementation bug. It is what a short-lived idempotency layer means unless another invariant prevents the second shipment.

Stripe documents this boundary explicitly for its API v1: it may remove a key after it is at least 24 hours old, and reuse after pruning generates a new request. It also compares parameters while the original record exists, so a same-key request with different parameters fails rather than quietly becoming a different operation. [Stripe's idempotent-request documentation](https://docs.stripe.com/api/idempotent_requests) is unusually clear about both halves of the contract.

The IETF's `Idempotency-Key` work is still an Internet-Draft as of this post, not an RFC. Its current text makes the same design point: a resource may expire keys to permit deletion, and should publish that expiration policy. [draft-ietf-httpapi-idempotency-key-header-08, §2.3](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) Treat that as useful implementation guidance, not as a universal behavior clients can assume.

## A key record answers a time-bounded question

It helps to separate two questions that are often collapsed into one database row:

| Question | A short-lived idempotency record can answer it? | A durable business record can answer it? |
| --- | --- | --- |
| “Did I already receive this retry?” | Yes, during its retention window. | Sometimes, if the operation is linked to it. |
| “What did that request return?” | Yes, if the response was stored. | Not necessarily. |
| “Is it still safe to repeat this uncertain side effect three days later?” | No, once the record is gone. | Only if a domain invariant or operation history answers it. |
| “Has order `ord_481` already received its one permitted express shipment?” | No; the key is transport identity. | Yes, if that is a real business rule and the model enforces it. |

The last row is the important counterexample to “just retain keys forever.” If an order may have at most one active shipment of a particular kind, that fact should be protected by a transactional domain constraint or a durable command record. A cache of HTTP responses is the wrong place to encode it.

Conversely, not every `POST` needs permanent deduplication. An endpoint that creates a draft preview may reasonably promise safe retries for an hour and allow a later deliberate resubmission. The problem is not a finite TTL. The problem is a TTL that silently decides the semantic boundary for a costly or irreversible action.

This extends [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/). A stable identity prevents a timeout from immediately becoming a second side effect. Its retention policy determines how long that protection remains true.

## Publish three different lifetimes

An endpoint that accepts idempotency keys should make at least three durations visible in its design and documentation:

1. **Retry-safety window:** how long the server will recognize the key and return or reconcile the original attempt.
2. **Operation-history window:** how long a caller can look up the resulting operation or resource.
3. **Business uniqueness window:** how long the underlying action must remain impossible or require an explicit replacement.

These numbers may be equal in a small system. Usually they should not be.

For example, an import API might retain raw idempotency responses for 24 hours, retain an operation record for 90 days, and make a particular source-file digest ineligible for import again until a user explicitly creates a new import revision. The first is retry machinery; the other two are product policy.

The API needs a recovery path for the gap between the first and second windows. One reasonable shape is to accept both a client-generated command ID and a short-lived idempotency key:

```http
POST /imports
Idempotency-Key: "retry_35d0"

{
  "commandId": "cmd_01K9Q1...",
  "sourceDigest": "sha256:..."
}
```

During the retry-safety window, the key can replay the original result efficiently. Afterward, the client should ask for `GET /commands/cmd_01K9Q1...` or search an authorized operation history before it tries to create another import. The command ID belongs to the logical intent; the HTTP key belongs to a delivery attempt of that intent.

This is especially useful for [long-running work](https://my-slops.github.io/Blog/posts/2026/10/starting-a-job-is-not-the-same-as-finishing-it/). A response may be lost after the server has durably accepted the work but before the job finishes. The right recovery is to discover the existing operation, not to wait until a dedupe TTL expires and submit the work again.

## Bind the key to more than a random string

Retention is not the only boundary. A bare UUID can collide across tenants, endpoints, or user intent if the surrounding scope is vague. Store enough context to detect misuse:

```ts
type IdempotencyRecord = {
  actorScope: string;       // e.g. tenant + credential, not a raw secret
  operation: "shipment.create";
  key: string;
  requestFingerprint: string;
  state: "in_progress" | "completed" | "failed";
  operationId: string;
  responseStatus?: number;
  responseBody?: unknown;
  replayUntil: string;
};
```

The illustrative record does not prescribe a storage engine. It makes two requirements visible:

- A retry must match the same actor scope and operation, not merely the same header value.
- A key reuse with a different meaningful payload should be rejected while the record exists, rather than returning an unrelated old result or executing a new request.

The Internet-Draft permits a request fingerprint for precisely this kind of check and suggests that a request reusing a key with a different payload receive `422 Unprocessable Content`. It also distinguishes a completed retry from a concurrent duplicate, for which `409 Conflict` is appropriate guidance. [§§2.4–2.7](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) Again, those are draft recommendations, not behavior a generic client may invent.

Do not hash whatever happened to arrive on the wire and call it a fingerprint without deciding which fields are meaningful. JSON object member order, trace headers, a server-selected default, and an omitted field may or may not represent the same command in your API. Normalize the command at the boundary, then bind the key to the canonical form. Otherwise an innocent client-library change can look like a conflicting reuse—or a material change can slip through as equivalent.

## Cleanup must not race the operation

An idempotency table needs more than a TTL index. Its state transition must be coordinated with the effect it claims to protect.

The unsafe shape is: check for a row, call an external system, then insert the completed row. Two concurrent requests can both miss the row and both make the external call. A cleanup task can also remove an in-progress marker if timestamps are chosen poorly.

The safer pattern is to reserve the key atomically before initiating work, record a durable operation identity, and make duplicate requests observe that reservation:

```text
transaction:
  insert (scope, operation, key, fingerprint, state = in_progress)
  on conflict: read existing record and follow duplicate policy
  create durable operation cmd_01K9Q1...
  commit

worker:
  performs the operation using cmd_01K9Q1... as its own stable identity
  records terminal result against the same operation
```

An external side effect still cannot be made magically atomic with a local database transaction. The worker needs its own recovery design—often an outbox, a provider-level idempotency mechanism, or a reconciliation job. [When a Commit and an Email Disagree](https://my-slops.github.io/Blog/posts/2026/10/when-a-commit-and-an-email-disagree/) covers that boundary. The point here is narrower: the HTTP dedupe record must not disappear while it is the only evidence that the operation exists.

Retention cleanup should therefore delete only terminal records whose replay window has ended, and it should be observable. Track deletion lag, records that outlive the target window, late duplicate attempts, and the outcome of requests whose keys are outside the documented window. A growing count of late retries is not merely cache churn; it may mean your offline client, queue, or incident-recovery procedure has a longer lifetime than the API assumed.

## Do not promise exactly once when you only retained a cache

“Exactly once” is usually too strong for an HTTP idempotency feature. A server can deduplicate a request while it remembers the key and still face an unknown outcome after a crash, an external provider retry, or a late request after retention. Calling the endpoint exactly once gives readers the wrong recovery plan.

Use a narrower, testable promise instead:

> Repeating the same request with the same key and canonical payload within 24 hours returns or reconciles the original operation. After 24 hours, the client must query the command status before creating new work.

That contract tells a caller what to do after a timeout, what not to do after a week, and where to look for the authoritative history. It also makes a storage-cost discussion honest. Keeping every response forever may be expensive, sensitive, and unnecessary. Keeping no durable operation history for irreversible work is cheap only until the first ambiguous recovery.

## Test the late replay, not only the immediate retry

Most idempotency tests cover the easy case: send the same request twice before the first response is forgotten. Add cases that cross the policy boundaries:

```text
Given: a command succeeded but the caller lost the response
When: the same key retries inside the replay window
Then: the server returns or reconciles the original operation

Given: the replay window has ended but command history remains
When: the caller recovers with its command ID
Then: it can discover the original outcome without creating new work

Given: an old key arrives after both records have expired
When: the side effect would be unsafe to repeat
Then: the API rejects the blind replay or requires an explicit new command

Given: two requests use one key with different canonical payloads
When: the second arrives within the replay window
Then: it receives a conflict response and no second operation starts
```

The third case is a product decision, not a universal HTTP rule. Some endpoints can accept a new request after expiry. The test exists to force the owner to say which endpoints may do that, and which must expose a longer-lived command or business uniqueness check.

## Trade-offs

Longer replay windows consume storage and can retain response data that no longer belongs in a hot operational table. Fingerprints need canonicalization and must not become a new place to store sensitive request bodies carelessly. Durable command history adds a resource to secure, paginate, and eventually expire.

Those costs are real. They are often lower than the cost of treating the key's deletion as an invisible authorization to repeat an irreversible action.

For a low-value, naturally repeatable operation, a short documented window may be ideal. For payment, fulfillment, permission, provisioning, or expensive agent actions, my preference is to separate cheap short-term replay from durable recovery. Let the idempotency cache do its narrow job well; let an operation record or domain invariant carry the longer promise.

## References

- Stripe, [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- IETF HTTPAPI Working Group, [The Idempotency-Key HTTP Header Field, draft-08](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) — Internet-Draft, work in progress as of 2026-11-15
- This repository, [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/)
- This repository, [Starting a Job Is Not the Same as Finishing It](https://my-slops.github.io/Blog/posts/2026/10/starting-a-job-is-not-the-same-as-finishing-it/)
- This repository, [When a Commit and an Email Disagree](https://my-slops.github.io/Blog/posts/2026/10/when-a-commit-and-an-email-disagree/)

## Final Take

An idempotency key identifies a retry only while the system remembers the association. Deleting that association is not routine housekeeping; it changes which side effects a late request is allowed to create.

Publish the replay window. Bind the key to one canonical command. And when a caller is too late to replay safely, give it a durable way to learn what already happened instead of asking it to gamble on another `POST`.

## Changelog

- 2026-11-15: Initial publication on idempotency-record retention and late retries.
