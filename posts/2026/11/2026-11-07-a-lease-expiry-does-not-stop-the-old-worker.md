---
title: "A Lease Expiry Does Not Stop the Old Worker"
date: "2026-11-07"
updated: "2026-11-07"
slug: "a-lease-expiry-does-not-stop-the-old-worker"
description: "A lease lets another worker take over after a failure, but it cannot retract a delayed request or stop a paused process. Protect shared state by making the effect receiver reject stale ownership."
summary: "Treat a distributed lease as a coordination signal, not a physical stop button. When a stale worker could still mutate shared state, send a monotonically increasing fencing token to the protected resource and make that resource reject superseded owners."
tags: [distributed systems, reliability, software architecture, developer tooling]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/a-lease-expiry-does-not-stop-the-old-worker/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

A lease is how a system recovers when a worker disappears. It is not a way to make that worker disappear.

A process can pause in a garbage-collection stop, lose network access, or have a request delayed after it has lost its lease. Another worker can legitimately take over. When the old worker resumes, it may still send a write that it started while it believed it was owner.

If that write can damage shared state, the resource being changed—not just the lock service—must reject stale ownership. Issue a monotonically increasing **fencing token** with each grant, include it with the protected operation, and have the receiver reject a token older than one it has already accepted.

That rule has a sharp boundary: it works only where the receiver can enforce it. A lease around an email API, payment gateway, or arbitrary third-party effect is still advisory unless that system offers an equivalent conditional or idempotent operation.

## The old worker is still a process

Suppose two workers generate a daily customer export. A lease keeps only one worker responsible at a time:

```text
10:00  worker A acquires export/acme, token 41, lease through 10:30
10:12  worker A pauses before its object-store write reaches the service
10:30  the lease expires
10:31  worker B acquires export/acme, token 42, and writes the current export
10:33  worker A resumes; its delayed write with token 41 arrives
```

The lock service did its job: it made the job available after worker A stopped renewing. But its expiry did not revoke worker A's CPU time, delete A's credentials, or unsend A's request. If the object store accepts A's write, yesterday's export can overwrite the current one after a valid takeover.

This is not an exotic split-brain story. It is an ordinary consequence of independent failure and uncertain communication. The Chubby lock-service paper describes the same shape: a lock holder can issue a request, fail, another process can acquire the lock and act, and the original request can arrive afterward. Its answer is a *sequencer* containing the lock generation, which receiving servers are expected to validate before performing the protected operation. [Chubby §2.4](https://systems.cs.columbia.edu/ds2-class/papers/burrows-chubby.pdf)

The important correction is small but consequential: **lease expiry changes who may acquire responsibility next; it does not prove that the previous holder cannot still act.**

## Put the ordering check where the effect happens

Give every successful acquisition a token that orders ownership grants for the protected resource:

```text
lock service grants export/acme to A  → token 41
lock service grants export/acme to B  → token 42
```

Then send that token with the write. The resource persists the greatest token it has accepted for `export/acme` and rejects lower ones:

```text
accepted token: 41
accepted token: 42
received token: 41  → reject as stale
```

The exact schema is product-specific, but the conditional write needs to live in the same atomic boundary as the state it protects. This SQL is illustrative:

```sql
update export_state
set artifact_uri = :artifact_uri,
    fence_token = :fence_token,
    updated_at = now()
where customer_id = :customer_id
  and fence_token <= :fence_token;
```

No updated row means this caller is stale and must not report a successful export. Whether equality is safe depends on the effect: it can be useful for a repeatable retry from the same lease holder, but only when the payload and downstream effects are also safe to repeat. A token does not replace an operation identity; it answers a different question: *is this caller still at least as current as the last owner the resource accepted?*

The receiver must keep the token with the protected data, rather than in the worker's memory or a log line. A local `if (lease.isValid())` check races with the very failure it is trying to prevent. Checking a token in the lock service after the write is too late. The decision must surround the mutation.

This is why Chubby's sequencer is passed to the server that performs the operation, rather than treated as a client-side reminder. The paper notes that a server can validate it through Chubby or compare it with the most recent sequencer it has seen. [Chubby §2.4](https://systems.cs.columbia.edu/ds2-class/papers/burrows-chubby.pdf)

## A fence is not just a random lock value

Many lease implementations return a random owner ID. That ID is useful: it prevents worker A from releasing a lock that worker B later acquired. It does not by itself let a receiver decide which owner is newer.

For stale-write protection, the receiver needs an ordering it can compare. A per-resource monotonically increasing integer is the usual form, but a coordination system's durable revision or generation can serve if it has the required ordering and scope. The token must identify the same protection domain as the effect. A token for `export/acme` should not be used to order writes to every customer export, and a globally increasing counter is unnecessary if the resource only needs per-customer order.

Do not confuse this with a version check on arbitrary state. A version precondition says, “apply this mutation only if the resource is still the version I read.” A fencing token says, “apply this mutation only if no newer owner has already been accepted.” Some systems need both.

Cloud Storage's generation preconditions illustrate the first mechanism: a request can require a particular object generation and otherwise fails with `412 Precondition Failed`. That prevents a delayed operation from applying to an unexpected object version. [Cloud Storage request preconditions](https://cloud.google.com/storage/docs/request-preconditions) It is not automatically a lease fence; it becomes part of a safe design only when the precondition represents the ownership and state transition the application needs.

## What a fencing token cannot undo

Fencing is deliberately narrow. It rejects a stale request that reaches an enforcing receiver after that receiver has accepted a newer token. It cannot retract an external effect the old worker completed before any enforcement point observed the takeover.

That creates three common boundaries:

| Effect | Can a fence protect it? | What to require instead or in addition |
| --- | --- | --- |
| Database row owned by your service | Usually | Conditional update that stores and compares the token atomically. |
| Object or document with version preconditions | Sometimes | Map the ownership transition to a supported conditional write; test delayed retries. |
| Queue message handled by your consumer | Usually | Persist owner generation with the business transition, plus a stable message identity. |
| Email, payment, or vendor call without a comparable condition | Not by itself | Provider idempotency, a reservation/commit protocol, compensation, or an honest at-least-once contract. |

There is another subtle limit. If worker A's stale write reaches the resource *before* worker B performs any write or otherwise records token 42 there, a receiver that knows only its highest accepted token may still accept A's request. A fencing token prevents old effects from overtaking newer accepted ownership; it does not act as a remote kill switch at the instant a clock expires. If the business rule requires the resource to know immediately that A is no longer authorized, make the resource consult a current authority or record the takeover before effects are allowed. That costs availability and latency, so choose it only when the stronger guarantee is actually needed.

This is also why a short TTL is not a correctness proof. Shorter leases reduce the recovery delay, but they do not eliminate pauses, late packets, or the gap between coordination and effect enforcement.

## Test the pause, not only lock acquisition

A test that proves worker B cannot acquire a live lease has not tested the dangerous path. Exercise the delayed holder explicitly:

```text
Given: A owns resource R with token 41
When: A pauses after preparing a protected write
And: A's lease expires and B obtains token 42
And: B's protected write is accepted
Then: A's resumed write is rejected and cannot replace B's state

Given: A retries the same safe write under token 41
When: no newer token has been accepted
Then: the retry has its documented idempotent outcome, not a duplicate effect

Given: a write path bypasses the normal worker
When: it attempts to mutate R without a current token
Then: the resource rejects it or that path is prevented entirely
```

For a system that renews leases, add a local safety rule too: on renewal uncertainty, stop starting new irreversible work and make the uncertainty visible. That reduces the stale window, but it is a complement to receiver enforcement, not a substitute for it. The same admission boundary matters during shutdown: a departing worker should stop taking new obligations before it tries to drain the ones it already owns. [Graceful Shutdown Starts by Refusing New Work](https://my-slops.github.io/Blog/posts/2026/11/graceful-shutdown-starts-by-refusing-new-work/)

## Trade-offs

Fencing adds state to the resource, changes write APIs, and can surface retries as explicit stale-owner errors. A token allocator must be reliable enough that a new grant is truly newer within the resource's protection domain. Every mutation path must enforce the condition; one unguarded admin script, bulk job, or legacy endpoint can reopen the race.

For work that is naturally idempotent, cheap to repeat, and unable to overwrite newer state, a lease alone may be a reasonable efficiency optimization. The machinery earns its cost when a late owner can replace a newer result, trigger an irreversible action, or make a decision that another component will trust.

Do not add a distributed lock merely to serialize a database operation that an atomic conditional update can already express. When the database is the resource, its transaction and constraints are often the better coordinator. A lease becomes useful when responsibility itself spans workers or when the protected work has a longer lifetime than one transaction. Even then, use the lease to assign work and use the resource to defend the effect.

## References

- Mike Burrows, Google, [The Chubby lock service for loosely-coupled distributed systems](https://research.google/pubs/the-chubby-lock-service-for-loosely-coupled-distributed-systems/) (OSDI 2006); see §2.4 for sequencers and delayed requests.
- Google Cloud, [Request preconditions](https://cloud.google.com/storage/docs/request-preconditions)
- This repository, [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/)
- This repository, [Graceful Shutdown Starts by Refusing New Work](https://my-slops.github.io/Blog/posts/2026/11/graceful-shutdown-starts-by-refusing-new-work/)

## Final Take

The useful question is not, “Did the old lease expire?” It is, “Can the old holder still produce an effect, and will the effect receiver know to reject it?”

If the answer to the second question is no, the lock is coordinating optimism. Put the ordering check at the effect boundary, and let a stale worker fail visibly instead of silently overwriting its successor.

## Changelog

- 2026-11-07: Initial publication on leases, stale workers, and receiver-enforced fencing tokens.
