---
title: "Revocation Is a Latency Requirement"
date: "2026-10-23"
updated: "2026-10-23"
created_at: "2026-10-23T10:00:00-04:00"
published_at: "2026-10-23T10:00:00-04:00"
scheduled_at: "2026-10-23T10:00:00-04:00"
slug: "revocation-is-a-latency-requirement"
description: "A cached allow is correct only for some bounded interval. Define how quickly a revoked permission must take effect, then choose caches, replicas, and outage behavior that can meet it."
summary: "The useful question is not whether authorization may be cached. It is how long a removed relationship, disabled account, or emergency restriction may still authorize an operation—and whether the full path can prove that bound."
tags: [security, authorization, caching, distributed systems, reliability]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/revocation-is-a-latency-requirement/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

Removing a user from a project is not an instantaneous security property if an authorization service, a relationship replica, a decision cache, and a response cache can all remember the old answer.

State the requirement in time: *after this kind of change is accepted, this kind of request must be denied within this long.* Then make the entire authorization path—writes, replicas, decision caches, enforcement points, and failure handling—meet that bound. A cache TTL is an implementation setting. A revocation deadline is a security contract.

## Context

At 10:03, an administrator removes a departing contractor from the `payroll` workspace. At 10:04, the contractor's browser requests an export. The application asks an authorization service, but its local cache still has yesterday's answer:

```text
can(contractor_17, "export", payroll_q3) = true
```

The cached answer may be internally consistent. It is also the wrong answer after the relationship changed.

This failure is easy to miss because teams often ask whether authorization *can* be cached. Of course it can. The harder question is: **how long may a previously permitted request remain permitted after the relevant policy or relationship changes?**

That question is a latency requirement. It has a measurable start point, a maximum delay, a set of operations it covers, and a failure mode when the system cannot meet it.

OWASP's current guidance makes the same distinction: an authorization decision is only as reliable as its policy and input data; teams should record the maximum delay before a policy or attribute change must affect decisions. For emergency revocations, it recommends a dynamic update or authoritative lookup and measuring the propagation bound. [Authorization Policy and Data Distribution](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Policy_And_Data_Distribution_Cheat_Sheet.html)

## Key Points

### A complete cache key fixes identity, not time

The earlier question is still essential: a cache must not return one user's permitted representation to another user. [The Cache Key Is a Privacy Boundary](https://my-slops.github.io/Blog/posts/2026/08/the-cache-key-is-a-privacy-boundary/) explains why the subject, tenant, resource, and other representation inputs belong in that design.

But this key can be perfectly partitioned and still be stale:

```text
authz:v3:subject=contractor_17:action=export:resource=payroll_q3
    -> allow, expires in 10 minutes
```

The entry says *which* decision it represents. It says nothing about whether a membership revocation 30 seconds ago must supersede it. Putting a policy version or relationship revision in the key helps only if the enforcement point knows the current revision before it trusts the old entry.

There are also at least three different things teams casually call an “auth cache”:

| Cached thing | What can become stale | Useful control |
| --- | --- | --- |
| A final permit/deny decision | Subject, action, resource, policy, or relationship inputs | Bind all relevant inputs and give the entry a lifetime within the revocation deadline. |
| Policy or relationship data | A role assignment, group membership, account state, or rule revision | Track replication/version lag and reject data that is too old. |
| Protected response bytes | The caller is no longer entitled to data already rendered | Authorize the current request before returning the bytes, or invalidate/purge within the stated bound. |

Treating all three as a generic Redis TTL hides the trade-off that matters. A five-minute cache may be harmless for a product recommendation but unacceptable for disabling a compromised administrator account.

### Start with the deadline, not a convenient TTL

A useful requirement names the trigger, scope, deadline, and enforcement point:

```text
When:     a workspace membership is removed or an account is suspended
Scope:    reads, exports, writes, and agent-tool calls for that workspace
Deadline: no request may be permitted more than 30 seconds after the change commits
Proof:    exercise the production decision and cache path at the enforcement point
```

“Permissions update quickly” is not a requirement. Nor is “we cache checks for 30 seconds.” The first cannot be tested; the second says nothing about replica lag, missed invalidations, a browser response cache, or what happens while the policy service is unavailable.

The deadline may legitimately vary. An emergency account disable may need a much tighter bound than an entitlement change that only affects a navigation item. A high-impact write can require a fresh or higher-consistency decision while a low-risk read accepts a small, documented staleness window. The important move is to make the difference intentional instead of giving every action whatever freshness the fastest cache happens to provide.

OpenFGA exposes this trade-off directly: with its check cache enabled, permission changes are not reflected during the cache TTL; callers can request higher consistency, which bypasses that cache. Its documentation also cautions that bypassing a cache does not remove replication lag from an eventually consistent database. [OpenFGA query consistency options](https://openfga.dev/blog/query-consistency-options-announcement)

### The whole path must fit inside the bound

Suppose a membership write commits at `t0`. Before a request can safely rely on the change, several delays may be involved:

```text
membership write
  -> policy/relationship replication
    -> local PDP update or cache invalidation
      -> enforcement-point decision
        -> any response-cache reuse
```

For a conservative design, the worst relevant delays across that path must fit below the revocation deadline. A 10-second decision-cache TTL does not establish a 10-second revocation bound when the relationship replica can be two minutes behind. Conversely, a fast relationship stream does not help if an edge cache can serve a previously authorized export for an hour.

This is why “we sent an invalidation event” is not enough. It shows that one component attempted delivery. The property belongs at the policy enforcement point: did the real request stop receiving protected data or performing the protected operation by the promised time? OWASP recommends testing effective decisions at that point, including delayed updates and recovery—not merely observing policy delivery. [Authorization Policy and Data Distribution](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Policy_And_Data_Distribution_Cheat_Sheet.html#freshness-and-outages)

For very sensitive transitions, a version fence can be clearer than hoping every cache invalidation arrives. Record the revision returned by the revocation write, and require a later authorization check to observe at least that revision before it permits the dependent operation. Google Zanzibar calls its analogous consistency token a *Zookie*; the larger lesson is not to copy its global architecture, but to make “fresh enough for this change” a first-class part of the interface. [Zanzibar: Google's Consistent, Global Authorization System](https://www.usenix.org/conference/atc19/presentation/pang)

### A cached permit must not silently outlive its authority

Keep the policy decision close to the operation that releases data or causes an effect:

```ts
async function exportPayroll(request: Request) {
  const subject = await requireSubject(request);

  const decision = await policy.check({
    subject,
    action: "payroll.export",
    resource: { type: "workspace", id: request.params.workspaceId },
    consistency: "required-for-high-impact-write",
  });

  if (!decision.permit || decision.freshUntil < Date.now()) {
    throw forbidden();
  }

  return exports.startFor(subject, request.params.workspaceId);
}
```

The names are illustrative. The design question is concrete: what proves that `decision` was evaluated from inputs fresh enough for an export *now*? A generic `allow: true` does not carry that proof.

The same care applies to cached response bytes. A service may cache a payroll report by document version and tenant, then authorize the current request before returning it. That preserves the performance benefit without treating a cache hit as a durable permission. If the system instead stores a per-user rendered response and returns it without a fresh check, the response cache has become an undeclared authorization engine.

OWASP's output-handling guidance recommends bounding cached decision reuse to the same subject, action, resource scope, tenant, and relevant policy/input state within an approved freshness limit; a cached permit must not outlive its required revocation deadline. [Authorization Decisions and Output Handling](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Decisions_And_Output_Handling_Cheat_Sheet.html)

### Outage behavior is part of the contract

Caching often enters the design to keep a policy service off the critical path. That can be reasonable, but it leaves an uncomfortable case: what happens when the system cannot determine whether its policy data is fresh enough?

For an operation whose revocation deadline cannot be met with the data on hand, the conservative answer is to deny that operation or hold it for review. Serving the last known allow because it is available changes a transient availability problem into an access-control policy. It may be the right product decision for a low-risk read with an explicitly accepted grace period; it should not be an accidental default for exports, deletions, payments, or administrative changes.

This is also why a cursor, session, or agent run cannot inherit an earlier permit indefinitely. [A Page Cursor Is Not Permission to Keep Reading](https://my-slops.github.io/Blog/posts/2026/10/a-page-cursor-is-not-permission-to-keep-reading/) covers the pagination form of the problem: continuation state is not authorization. Evaluate the current action against current-enough state.

## Steps / Code

Review one revocable permission path end to end:

1. Choose a real change: remove group membership, suspend an account, revoke a share link, or apply an emergency restriction.
2. Define when its clock starts. Usually this is a successfully committed authoritative write, not when an asynchronous event is eventually consumed.
3. Declare the maximum permitted delay for each affected action class. Do not borrow the TTL from an existing cache as the answer.
4. Inventory every stale state on the path: policy bundles, relationship replicas, local PDP data, final-decision caches, browser/CDN/application response caches, long-running exports, and agent continuation state.
5. Decide whether each layer uses authoritative lookup, bounded TTL, version fencing, targeted invalidation, or a deliberately documented lease.
6. During an integration test, warm every relevant cache, commit the revocation, and repeatedly perform the real protected operation through the production-like route. Assert that it denies by the deadline.
7. Repeat with delayed events, a disconnected replica, a missed invalidation, policy-service unavailability, and recovery. Verify the enforcement point's behavior, not just logs from the update pipeline.

Keep the test's clock and success criterion visible. A test that only asserts “the next request is denied” can pass while the system takes ten minutes, well beyond what incident response or a customer promise can tolerate.

## Trade-offs

Tighter revocation deadlines cost something: more authoritative reads, lower cache hit rates, invalidation infrastructure, version propagation, and deliberate fail-closed behavior during some outages. A globally ordered consistency design may be unnecessary for a small internal tool.

The opposite extreme also has a cost. A system that cannot say how long a former employee, revoked integration, or removed tenant member may retain access does not have a revocation guarantee; it has a hopeful cache configuration.

Use the cheapest design that meets the consequence of a stale permit. For a reversible, low-sensitivity display, a short and measured stale window may be a sound trade. For actions that disclose sensitive data or create durable effects, make freshness an explicit part of the access decision.

## References

- OWASP Cheat Sheet Series, [Authorization Policy and Data Distribution](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Policy_And_Data_Distribution_Cheat_Sheet.html)
- OWASP Cheat Sheet Series, [Authorization Decisions and Output Handling](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Decisions_And_Output_Handling_Cheat_Sheet.html)
- OWASP Cheat Sheet Series, [Web Cache Security](https://cheatsheetseries.owasp.org/cheatsheets/Web_Cache_Security_Cheat_Sheet.html)
- OpenFGA, [Query consistency options](https://openfga.dev/blog/query-consistency-options-announcement)
- Google, [Zanzibar: Google's Consistent, Global Authorization System](https://www.usenix.org/conference/atc19/presentation/pang)
- This repository, [The Cache Key Is a Privacy Boundary](https://my-slops.github.io/Blog/posts/2026/08/the-cache-key-is-a-privacy-boundary/)
- This repository, [A Page Cursor Is Not Permission to Keep Reading](https://my-slops.github.io/Blog/posts/2026/10/a-page-cursor-is-not-permission-to-keep-reading/)

## Final Take

Revocation is not complete when a database row changes or an invalidation is published. It is complete when the policy enforcement point stops permitting the operations that change was meant to stop, within the time your system promised.

Set that time before choosing the cache. Then measure the full path against it.

## Changelog

- 2026-10-23: Initial publication.
