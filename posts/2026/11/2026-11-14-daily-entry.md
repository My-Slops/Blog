---
title: "Your Read Replica Did Not See the Save Yet"
date: "2026-11-14"
updated: "2026-11-14"
slug: "your-read-replica-did-not-see-the-save-yet"
description: "A successful primary-database write does not promise that a later read routed to an asynchronous replica can observe it. Choose and test a read-your-writes contract instead of treating replica lag as a dashboard-only concern."
summary: "A commit on the primary and visibility on a read replica are different events. Return the committed view, route follow-up reads deliberately, or wait for a replica to reach a named consistency point when the product promises read-your-writes."
tags: [databases, distributed systems, reliability, API design, software architecture]
author: "vabs"
status: published
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/your-read-replica-did-not-see-the-save-yet/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

An API can commit a change, return `200 OK`, and immediately send the caller to a read replica that still shows the previous value. Nothing necessarily failed. The write is durable on the primary; the replica has simply not replayed it yet.

That gap becomes a product bug when a person saves a setting, refreshes the page, and sees the old setting—or when a control plane accepts a permission change and then makes its next decision from an older copy. A replica-lag chart may reveal the cause, but it does not define what the caller is entitled to see.

Choose the contract at the API boundary: return the committed representation, temporarily route follow-up reads to the writer, require a replica to reach a known consistency point, or explicitly allow stale reads. PostgreSQL makes the mechanism visible: streaming replication is asynchronous by default, and its `remote_apply` option exists precisely because remote receipt and remote visibility are different guarantees. [Its standby documentation](https://www.postgresql.org/docs/current/warm-standby.html) is a useful concrete reference even when the production database is not PostgreSQL.

## The redirect that contradicts the save

An administrator changes an organization setting from `billing_contact = old@example.test` to `new@example.test`:

```text
PATCH /organizations/acme
→ primary commits the new contact
→ API returns 200
→ browser navigates to GET /organizations/acme
→ router selects a read replica
→ replica still returns old@example.test
```

The obvious explanation to the administrator is that the save failed. They may submit the form again, open a support ticket, or make a second change against a screen that no longer represents current state. The system may eventually converge without any database error, but the interaction has already broken its promise.

This is not an argument against read replicas. They are useful when a workload can accept a slightly older view in exchange for read capacity or geographic placement. The mistake is letting a routing decision silently choose the consistency model for an interaction that never agreed to one.

PostgreSQL's streaming replication documents the underlying shape directly: it is asynchronous by default, so there is a delay between a primary commit and the change becoming visible on a standby. A hot standby can serve read-only queries while it continuously replays the primary's write-ahead log. [PostgreSQL's log-shipping documentation](https://www.postgresql.org/docs/current/warm-standby.html) also distinguishes a standby receiving WAL from replaying it. Received is not visible.

## “Low lag” is not a read-your-writes contract

Teams often respond with a replica-lag alert or a short delay after a write. Both can be useful operationally. Neither answers the caller's actual question: *will the replica selected for this read include my commit?*

A lag measurement is an observation over a replica and a point in time. The next request may be routed to a different replica, a network interruption may delay replay after the measurement, and a quiet primary can make time-based lag appear healthy even when there is no evidence about a particular write. Sleeping for 500 ms is therefore a probability statement, not a consistency guarantee.

The stronger question is causal: does this read include at least the write that produced this response? PostgreSQL exposes one building block for answering it. `pg_last_wal_replay_lsn()` reports the last WAL location replayed by a standby; its recovery functions distinguish WAL received from WAL replayed. [PostgreSQL's administration functions](https://www.postgresql.org/docs/current/functions-admin.html) describe both values. A system that uses a position token can wait for the chosen replica to replay the required position before allowing the dependent read.

That is an implementation technique, not a universal API feature. Managed database services, proxies, and non-PostgreSQL engines expose different tokens—or none. The product requirement comes first; use the strongest mechanism the actual storage and routing path can support.

## Pick the promise before adding replicas

There are several honest contracts. They have different costs and fit different interactions.

| Contract | What the caller can rely on | Typical implementation | Cost / boundary |
| --- | --- | --- | --- |
| Return the committed representation | The response itself shows the saved value. | Include the canonical updated resource in the write response. | Does not make a later independent read fresh. |
| Read from the writer for a session window | A follow-up read uses the same authoritative store. | Route a user, resource, or request chain to the primary after a write. | Increases primary load; a fixed window can expire before a slow replica catches up. |
| Wait for a named replica position | A chosen replica has replayed at least the required write before serving the read. | Carry a commit/consistency token and wait or fall back to the writer. | Adds latency and needs token plumbing and a timeout policy. |
| Stale reads are allowed | The result may lag behind recent writes. | Route normally to replicas and label or design the UI accordingly. | Not suitable when an immediate read drives a conflicting action or safety decision. |

For a settings form, returning the committed representation often removes the first surprising read entirely. For a page that must be refreshed, routing that resource's immediate follow-up reads to the writer can be simpler than propagating a token through every API call. For a low-latency read-heavy system with a strict per-request guarantee, a consistency token may be worth the complexity.

None of these should be inferred from a database topology diagram. “We have replicas” describes capacity and availability machinery. It does not answer whether a user who just changed a shipping address may immediately obtain the new address from a different endpoint.

## A write response can carry an obligation

When a response creates a state that later calls depend on, treat its consistency information as part of the API contract. Conceptually, a write may return both the updated representation and an opaque marker:

```json
{
  "organization": {
    "id": "acme",
    "billingContact": "new@example.test",
    "revision": 28
  },
  "consistency": {
    "scope": "organization:acme",
    "token": "opaque-storage-position"
  }
}
```

The caller can present that marker on a dependent read. The serving layer either finds a replica that has reached the marker, waits within the caller's deadline, routes to the primary, or returns an explicit response that it cannot satisfy the requested consistency now.

Do not substitute an autogenerated row ID, a timestamp, or a token the server cannot actually enforce. As [The First Row May Not Be the First Fact](https://my-slops.github.io/Blog/posts/2026/11/the-first-row-may-not-be-the-first-fact/) explains, identity allocation does not establish commit order. A client-generated time says even less about what a replica has replayed. The marker must refer to a storage or application boundary that the chosen reader can compare against.

The token also needs a scope. A replica position can establish that one primary's history includes a commit; it does not make a cache entry fresh, prove an external search index has updated, or guarantee that a different service has consumed an event. If an endpoint combines several stores, its read-your-writes contract must name which of them it covers.

## Synchronous replication changes one boundary, not every boundary

PostgreSQL's synchronous replication has a useful but often overstated option. With a configured synchronous standby, `synchronous_commit = remote_apply` waits until that standby reports that it replayed the transaction, making the commit visible to queries there. The documentation notes that this can enable causal consistency for simple load-balancing cases. [PostgreSQL's standby documentation](https://www.postgresql.org/docs/current/warm-standby.html) also makes clear that this adds waiting and that synchronous standbys must be selected and connected.

That can be an excellent trade for a small set of writes whose immediate remote visibility matters. It is not a blanket guarantee for every read path:

- a request may be routed to a different asynchronous replica;
- a cache or search index can still be behind the database;
- the synchronous standby can be unavailable, changing the latency or availability trade-off; and
- writes that do not wait for remote apply do not acquire the promise by association.

This is why “turn on synchronous replication” is not a complete answer to a user-visible freshness requirement. It is a database-level mechanism that helps only when the routing and failure policy preserve the same boundary.

## Authorization and control-plane reads deserve special suspicion

Some stale reads are merely confusing. Others are security or operational failures.

If an administrator revokes a credential and the next authorization check reads a stale replica, the system may continue accepting the credential beyond the promised revocation window. If a deploy controller reads an old desired state after acknowledging a rollback, it can launch work that the operator believes has been cancelled. These paths need an explicit maximum staleness and a failure policy, not an undocumented preference for cheaper reads.

[Revocation Is a Latency Requirement](https://my-slops.github.io/Blog/posts/2026/10/revocation-is-a-latency-requirement/) makes the broader point: “updates quickly” is not testable until the system says which readers must observe the change and by when. Read replicas are one common reason that vague promise becomes false.

For these decisions, my preference is conservative: read from the authority, or fail closed when the authoritative state cannot be obtained within the required window. Serving a stale product catalog is often acceptable. Serving a stale permission decision usually is not.

## Test the disagreement, not just replication health

An integration test that writes to a primary and later observes the change from a replica proves only eventual convergence. Add cases that make the contract observable:

```text
Given: a settings write has committed on the primary
And: the selected replica has not replayed it
When: the client performs its dependent read
Then: it receives the committed response, a writer-routed read,
      or an explicit consistency failure according to the contract

Given: a read carries a consistency token
When: no eligible replica reaches that token before the deadline
Then: the service follows its documented fallback or failure policy
      and never returns an older state as though it were current

Given: a permission revocation is acknowledged
When: the authorization path cannot read authority within its freshness limit
Then: it denies or visibly errors according to the security policy
```

Also measure the consequences of the policy: primary fallback rate, wait time for token-gated reads, replica-position lag, and consistency failures by endpoint. A single average replica-lag graph cannot tell whether the paths with strict promises are satisfying them.

## Trade-offs

Strict read-your-writes costs something. Writer affinity concentrates reads. Position waits consume latency budget and can reduce availability when a replica is unhealthy. Synchronous replication can increase commit latency and lock contention; PostgreSQL explicitly warns that incautious use can reduce application performance. A system that needs cross-region, multi-store causal consistency may require more architecture than a routing rule.

Do not pay that cost everywhere by reflex. A feed, aggregate dashboard, or analytics view can often state that it is eventually consistent and remain useful. The important distinction is that it is a declared product property, not an accident of which connection pool handled the request.

## References

- PostgreSQL, [Log-Shipping Standby Servers](https://www.postgresql.org/docs/current/warm-standby.html)
- PostgreSQL, [System Administration Functions](https://www.postgresql.org/docs/current/functions-admin.html)
- PostgreSQL, [Replication Configuration](https://www.postgresql.org/docs/current/runtime-config-replication.html)
- This repository, [The First Row May Not Be the First Fact](https://my-slops.github.io/Blog/posts/2026/11/the-first-row-may-not-be-the-first-fact/)
- This repository, [Revocation Is a Latency Requirement](https://my-slops.github.io/Blog/posts/2026/10/revocation-is-a-latency-requirement/)

## Final Take

A successful write says what the authoritative writer accepted. It does not, by itself, promise what an arbitrary replica will show one request later.

If a user or downstream action depends on seeing the change, make that relationship explicit: return the committed state, route the dependent read deliberately, or wait for a reader that can prove it has caught up. Replica lag is an operational metric. Read-your-writes is a contract.

## Changelog

- 2026-11-14: Initial publication on replica visibility and read-your-writes guarantees.
