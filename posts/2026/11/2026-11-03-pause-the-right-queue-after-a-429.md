---
title: "Pause the Right Queue After a 429"
date: "2026-11-03"
updated: "2026-11-03"
slug: "pause-the-right-queue-after-a-429"
description: "A rate-limit response tells a client to slow down, but not automatically which of its independent workloads shares the exhausted quota. Make the quota partition part of the API contract so one tenant's retry delay does not halt everyone else."
summary: "Treat throttling as a policy over a named partition, not as a global property of an HTTP origin. A client that knows the policy and partition can pause only the affected queue; one that does not should not invent a global cooldown."
tags: [api design, reliability, distributed systems, developer tooling]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/pause-the-right-queue-after-a-429/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

A `429 Too Many Requests` tells a client that the rejected request should slow down. It does not, by itself, tell the client whether that delay belongs to one user, one tenant, one API credential, one endpoint, or every request the client happens to send.

That distinction changes what a shared SDK, job runner, or agent should pause. If a tenant-specific quota is exhausted, pausing the whole process unnecessarily starves unrelated tenants. If a provider-wide capacity limit is exhausted, retrying every other tenant immediately turns one rejection into a coordinated retry storm.

Treat a limit as a policy over a **partition**. Document or return enough information for the client to associate future work with that partition. If it cannot know the partition safely, it should delay the failed operation and avoid inventing a global cooldown.

## One rejected request can describe very different queues

Consider an import service that uses one client process to submit work for many customer organizations:

```text
tenant acme       → POST /imports → 429 Retry-After: 30
tenant northstar  → POST /imports → ?
tenant orbit      → GET  /imports → ?
```

The common SDK reaction is a single `pausedUntil` timestamp keyed by API host. That is simple, and it is often wrong.

If the service limits imports per tenant, pausing `northstar` protects nothing. It only turns Acme's burst into a thirty-second outage for the other customers. If the service instead limits all import creation because its worker pool is full, allowing Northstar and Orbit to continue submitting imports can make recovery slower. A third policy might limit only the `POST /imports` route while leaving status reads deliberately available.

The response code cannot resolve that ambiguity. [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) defines `429` as too many requests in a period of time, but explicitly leaves both user identification and counting scope to the origin server. It gives per-resource, whole-server, and credential-based counting as possible choices.

`Retry-After` adds a time boundary, not an ownership boundary. It answers “when may I try this again?” It does not answer “which other work shares this answer?”

## The scheduler key should match the server's partition

For a client with concurrent work, the useful state is not:

```ts
pausedUntilByOrigin.set("https://api.example", now + 30_000);
```

It is closer to this illustrative model:

```ts
type Throttle = {
  policy: "import-create" | "catalog-read" | "provider-capacity";
  partition: string; // opaque, non-sensitive identifier or documented derivation
  retryAfterMs: number;
};

function throttleKey(limit: Throttle) {
  return `${limit.policy}:${limit.partition}`;
}

function mayStart(job: { policy: Throttle["policy"]; partition: string }, now: number) {
  const resumeAt = pausedUntil.get(`${job.policy}:${job.partition}`) ?? 0;
  return now >= resumeAt;
}
```

The exact data shape is application policy, not a universal HTTP API. The invariant is what matters: work can be held together only when the client knows it consumes the same quota.

For example, a service could define these partitions:

| Policy | Partition | Client action after exhaustion |
| --- | --- | --- |
| Import creation | tenant ID | Pause new imports for that tenant; keep other tenants moving. |
| Search requests | API credential | Pause searches using that credential, even if they represent different end users. |
| Expensive export | tenant ID + export route | Hold exports only; allow cancellation and status reads. |
| Emergency capacity shedding | provider-wide | Slow or reject all work in the documented class. |

The policy name is not cosmetic. It prevents a client from treating a per-tenant import budget and a global overload signal as the same queue merely because they were both expressed as `429`.

This is the missing half of [Rate Limits Need a Budget the Client Can See](https://my-slops.github.io/Blog/posts/2026/07/rate-limits-need-a-budget-the-client-can-see/). A visible remaining budget lets a client schedule before rejection. A visible or documented partition tells it which pending jobs that budget applies to.

## HTTP can carry a partition, but it is not a promise of universal behavior

The IETF HTTPAPI working group's RateLimit header-fields document is still an Internet-Draft as of this post. Its current design makes the distinction explicit: a quota policy can include a `pk` partition-key parameter, and a `RateLimit` value describes availability for a particular partition. It describes partitions such as per user, per application, per method, per resource, or a combination. [RateLimit header fields for HTTP, draft-11](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)

An illustrative response might look like this:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30
RateLimit: "import-create";r=0;t=30;pk=:YWNtZS1pbXBvcnRz:
Content-Type: application/problem+json

{
  "type": "https://api.example/problems/quota-exceeded",
  "violated_policies": ["import-create"]
}
```

Do not treat that example as permission to expose an account ID, an authorization token, or an infrastructure counter in a header. The draft warns against sensitive partition keys and recommends documenting how a client can predict a key for a future request. An opaque value can be enough when the client needs only equality: “does this pending job belong to the same paused partition?”

It is also reasonable not to expose a key. A public API may not want a caller to infer how capacity is shared. In that case, document the decision rule at the API level: for example, “all requests using one project credential share the write quota,” or “a 429 from export creation affects only that project’s exports.” A response body following [RFC 9457 problem details](https://www.rfc-editor.org/rfc/rfc9457.html) can carry a stable, documented problem type and safe application-specific fields when headers alone are not enough.

The important constraint is honesty. Do not present a partition label as an authorization claim or a reservation. The draft says available quota is a hint, not a service-level guarantee; another caller sharing the partition can consume it before the next request arrives, and the server may reduce limits under saturation.

## Unknown scope calls for a narrower client reaction

An HTTP library that knows nothing but `429` and `Retry-After` cannot correctly infer the quota topology. Its safest default is local:

1. mark the failed request or its documented retry identity as delayed;
2. honor the delay only while the operation's own deadline still makes retry useful;
3. do not change unrelated queues without an API contract that connects them; and
4. keep server enforcement as the final authority even when local scheduling predicts capacity.

That last point matters for agents and batch workers. A broad “pause all tools from this provider” response can be a useful emergency policy, but it should be a deliberate orchestration decision, not a conclusion manufactured from one tenant's `429`. Conversely, a client that continues every other request after a known global throttle is ignoring evidence it already has.

The retry should also preserve the original work identity. A delay is not permission to create a second import, charge, or email when the first request's outcome is uncertain. [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/) covers that separate recovery boundary.

## Test the pause boundary with two workloads

Most rate-limit tests send one sequence of requests and assert a `429`. That proves the server can reject. It does not prove that the client controls the right work after it does.

Add paired cases:

```text
Given: Acme and Northstar have independent import quotas
When: Acme receives 429 with a 30-second retry delay
Then: Acme's next import is delayed
And: Northstar's import can start immediately

Given: all imports share a provider-capacity quota
When: Acme receives 429 with a 30-second retry delay
Then: new imports for both tenants are held
And: status reads and cancellations follow their separately documented policy

Given: a queued import belongs to the paused partition
When: its original deadline expires before the retry time
Then: it records an explicit expired or deferred outcome instead of retrying late
```

These tests force the system to name the unit of control. They also reveal accidental global variables in SDKs: a single static cooldown is a policy, even when it began life as a convenience.

## Trade-offs

Partition-aware scheduling adds state, API documentation, and compatibility work. A client may have to handle missing, stale, or changing rate-limit fields, particularly when a gateway and an origin enforce different policies. The RateLimit draft itself says clients must not assume a future response will repeat the same fields, and that a positive remaining value does not guarantee a later request succeeds.

For a small single-tenant integration, one cooldown per credential may be exactly the right design. The extra partition machinery earns its cost when one process multiplexes unrelated tenants, routes, priority classes, or credential pools—and when unnecessarily pausing one of them has a visible cost.

The goal is not to make a client outsmart the server. It is to keep the client from adding an avoidable outage of its own.

## References

- IETF, [RFC 6585 §4: 429 Too Many Requests](https://www.rfc-editor.org/rfc/rfc6585.html#section-4)
- IETF HTTPAPI, [RateLimit header fields for HTTP, draft-11](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) — Internet-Draft, not a published RFC as of 2026-11-03
- IETF, [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- This repository, [Rate Limits Need a Budget the Client Can See](https://my-slops.github.io/Blog/posts/2026/07/rate-limits-need-a-budget-the-client-can-see/)
- This repository, [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/)

## Final Take

When a client receives a rate-limit response, the question is not merely when to retry. It is which work has actually been told to wait.

Make that partition visible or documentable. Then pause the right queue—not every queue that shares a hostname.

## Changelog

- 2026-11-03: Initial publication on quota partitions and client-side throttling scope.
