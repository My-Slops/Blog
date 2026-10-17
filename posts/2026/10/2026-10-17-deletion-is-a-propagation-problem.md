---
title: "Deletion Is a Propagation Problem"
date: "2026-10-17"
updated: "2026-10-17"
slug: "deletion-is-a-propagation-problem"
description: "Removing a record from the source system does not by itself remove the copies, indexes, caches, or active work that can still expose it."
summary: "Make deletion a tracked workflow: stop new retrieval first, then invalidate or remove each dependent representation and report which guarantees have actually been met."
tags:
  - ai agents
  - data engineering
  - reliability
  - security
  - api design
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/deletion-is-a-propagation-problem/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Deleting a customer document from the database is not the same thing as making it unavailable to an agent. The document may already have chunks in a retrieval index, a response in a cache, an export in object storage, and text in an active run's context.

Treat deletion as a propagation workflow with a durable identity. First prevent new retrieval. Then remove or invalidate each representation that is in scope. Finally, report the result as evidence—not as a cheerful boolean returned by the source database.

## Context

An employee asks an internal assistant, “Summarize the pricing exception in the Acme renewal.” The assistant retrieves a CRM note, sends excerpts to a model, and returns an answer.

Ten minutes later, the note is deleted. The source query now returns `404`. The team declares the problem solved.

Maybe it is. But a second agent may still retrieve an old chunk from a vector index. A cached search result may still point to the note. A batch re-indexer might reintroduce it from an export. The first agent's already-running task may still have the text in memory.

None of these possibilities means that deletion is futile. They mean that a source-row deletion is one state transition in a larger system. Calling it a complete erasure guarantee before the dependent systems have converged is an API lie.

HTTP makes a useful, deliberately limited version of this distinction. `DELETE` requests removal of a resource's association at the origin; it does not promise that every representation has been destroyed or that storage has been reclaimed. And even cache invalidation only affects the caches a state-changing request travels through—not every cache globally. [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.5) [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.4)

An agent architecture adds more representations, so it needs a more explicit deletion contract.

## Key Points

### Start with access, not physical erasure

The first useful promise is often: “no new agent run may retrieve this item.” That is an access decision, and it should not wait for every asynchronous cleanup job.

Put a tombstone or lifecycle state at the retrieval boundary, keyed by a stable content identity. Every retrieval path—direct record lookup, keyword search, vector search, cached answer lookup, and batch export—must check it before returning content.

```text
content id: doc_482

source record        -> deleted
retrieval policy     -> deny doc_482 immediately
vector chunks        -> cleanup pending
edge cache           -> invalidation requested
offline export       -> scheduled for expiry
active run           -> cannot be retroactively un-read
```

This is more reliable than assuming that every representation can be removed synchronously. It also expresses the property a user usually needs first: the item does not continue to enter new model contexts.

The distinction matters for authorization. A deleted source record is not a sufficient guard if a retrieval service can answer from an index without consulting the source. Give the retrieval service a current eligibility check or an index-side tombstone; do not let “fast path” mean “bypass the deletion policy.”

### Inventory representations before you promise a deletion SLA

“We delete data after 30 days” is not a technical commitment until the team can name *where* the data can reside and which deadline applies to each place.

For an agent system, the inventory commonly includes:

- canonical records and attachments;
- derived chunks, embeddings, and search metadata;
- caches, rendered previews, and generated summaries;
- queues, retry payloads, and dead-letter storage;
- analytics, support exports, and backups; and
- active requests and provider-side retention governed by that provider's contract.

These are not all equivalent. Removing an embedding may require deleting all chunks derived from a source version. A backup may be intentionally immutable until expiry. A model request that has already crossed a provider boundary may be governed by a different retention and deletion interface. Treat those distinctions as product constraints, not awkward details to hide behind one `deleted_at` field.

This is an architectural inventory, not a claim that every system needs instantaneous, global sanitization. The appropriate goal depends on data sensitivity, contractual commitments, legal requirements, and how much control you have over each store.

### A deletion request needs a result model

Avoid an endpoint that returns `204 No Content` and leaves callers to infer whether the record disappeared everywhere. Return an operation identity when cleanup can be asynchronous, just as you would for an import or deployment.

```ts
type DeletionOperation = {
  id: string;
  contentId: string;
  retrievalBlockedAt: string;
  representations: Array<{
    kind: "source" | "vector_index" | "cache" | "queue" | "export" | "backup";
    state: "removed" | "invalidated" | "pending" | "expires_on" | "out_of_scope" | "failed";
    detail?: string;
  }>;
  completedAt?: string;
};

async function requestDeletion(contentId: string) {
  await retrievalPolicy.block(contentId); // must happen before async fan-out

  return deletionOperations.create({
    contentId,
    work: ["remove-source", "remove-chunks", "invalidate-caches", "expire-exports"]
  });
}
```

The names are illustrative. The ordering is the point: block future access before cleanup begins, and retain enough per-representation status to make the final statement honest.

There is a valuable difference between `invalidated`, `removed`, and `expires_on`. Invalidated means a system must re-check before serving. Removed means the specified representation no longer exists in that store. `expires_on` means it is intentionally retained until a declared lifecycle boundary. Collapsing these into `deleted: true` is convenient for dashboards and useless in an incident.

### Verify the claim you plan to make

A cleanup job that reported success is evidence of an attempt, not necessarily evidence that every target was covered. Verification should match the promise.

For example:

1. Attempt retrieval by source ID, keyword, and vector query; none should return the blocked content after the access barrier is active.
2. Inspect the deletion operation for every representation that is in its stated scope.
3. Test re-indexing from the authoritative source and confirm it does not recreate blocked chunks.
4. Exercise a retry after a worker crash; it must converge on the same deletion operation rather than creating an ambiguous second cleanup.
5. Report residual lifecycle states—such as immutable backup expiry—rather than quietly calling them complete.

The broader discipline has an established analogue in media sanitization: NIST distinguishes verifying that a sanitization technique completed from validating that its outcome is adequate. The mechanism is very different for a distributed application, but the standard's underlying lesson transfers: an action record is not the same thing as assurance that the target was handled. [NIST SP 800-88 Rev. 2](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-88r2.pdf)

### Do not over-promise about in-flight work

Some copies cannot be recalled. If a user message containing a document was already sent to a model, deleting the source record cannot make that earlier request un-happen. If an analyst already exported data under an authorized process, a source delete does not erase their local copy.

That is not an argument to abandon deletion. It is an argument to state the boundary precisely: block future retrieval immediately; cancel queued work where supported; record active work that may have received the material; and follow the retention contract of each external processor.

The same honesty appears in [What "Cancel" Means After an Agent Starts Work](https://my-slops.github.io/Blog/posts/2026/10/what-cancel-means-after-an-agent-starts-work/). Stopping future orchestration and undoing a completed external effect are separate operations. Deletion has the same shape.

## Steps / Code

Review an agent system's deletion path with this checklist:

1. Assign every ingestible document a stable source ID and version; carry both into chunks, embeddings, caches, and jobs.
2. Identify every read path that can return the content without reading the canonical source.
3. Make each read path check an authoritative eligibility policy or a promptly replicated tombstone.
4. Fan out cleanup using one idempotent deletion operation, not a collection of unrelated best-effort tasks.
5. Give each representation a declared state and deadline.
6. Test a re-index, retry, restore, and cache hit after deletion—not only the source database query.
7. Make the user-facing result say which guarantee is complete and which lifecycle work remains.

## Trade-offs

An eligibility check adds latency and operational coupling to retrieval. A replicated tombstone reduces that coupling but introduces propagation lag and another store to operate. Synchronous cleanup gives a simpler-looking response but can turn a routine delete into a slow, fragile distributed transaction.

For low-sensitivity internal content, a source delete plus ordinary cache expiry may be an acceptable contract. For sensitive or regulated data, that is usually too vague: the system needs a stricter inventory, faster access blocking, evidence of cleanup, and explicit limits around backups and third-party processors.

Do not use this model to promise impossible erasure. Use it to prevent the more common failure: a system promises completion when it has only changed the first database row.

## References

- IETF, [RFC 9110: HTTP Semantics, `DELETE`](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.3.5)
- IETF, [RFC 9111: HTTP Caching, invalidation](https://www.rfc-editor.org/rfc/rfc9111.html#section-4.4)
- NIST, [SP 800-88 Rev. 2: Guidelines for Media Sanitization](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-88r2.pdf)
- This repository, [The Cache Key Is a Privacy Boundary](https://my-slops.github.io/Blog/posts/2026/08/the-cache-key-is-a-privacy-boundary/)
- This repository, [What "Cancel" Means After an Agent Starts Work](https://my-slops.github.io/Blog/posts/2026/10/what-cancel-means-after-an-agent-starts-work/)

## Final Take

Deletion is not a database verb with a comforting response code. It is a promise about what the system will no longer serve, where residual copies may still exist, and how it will prove progress.

Make that promise representation by representation. Your agents will be safer because they cannot keep retrieving content whose source merely *looks* deleted, and your users will receive a claim the system can actually support.

## Changelog

- 2026-10-17: Initial publication on deletion propagation in agent retrieval systems.
