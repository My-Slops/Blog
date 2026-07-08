---
title: "Rate Limits Need a Budget the Client Can See"
date: "2026-07-08"
updated: "2026-07-08"
created_at: "2026-07-08T10:00:00-04:00"
published_at: "2026-07-08T10:00:00-04:00"
scheduled_at: "2026-07-08T10:00:00-04:00"
slug: "rate-limits-need-a-budget-the-client-can-see"
description: "A 429 response tells a client it has already exceeded a limit. Budget information lets it avoid the failure before it becomes a retry storm."
summary: "Expose a rate-limit policy and remaining budget deliberately. Clients can then schedule work instead of discovering capacity only by being rejected."
tags: [APIs, distributed systems, reliability]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/rate-limits-need-a-budget-the-client-can-see/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

Many APIs teach clients about a rate limit only at the moment the client has crossed it:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

That is a useful stop signal, but it is a poor scheduling interface. The caller has already spent work, may have a queue full of similar requests, and now has to guess whether all of them should wait, fail, or retry together.

The better contract gives a client a visible budget while it can still make a choice. The IETF HTTPAPI working-group draft proposes `RateLimit-Policy` and `RateLimit` fields for this purpose. As of July 8, 2026, this is a draft, so APIs should document the version and semantics they implement. A client can defer nonurgent work, meter a batch, or reserve capacity for an interactive request before it receives a 429.

```http
RateLimit-Policy: "hourly";q=1000;w=3600
RateLimit: "hourly";r=47;t=180
```

## A number is not a policy unless it is scoped

“47 requests remain” is ambiguous without the identity and resource it applies to. Is that a per-user, per-token, per-tenant, per-route, or global budget? Does a request cost one unit or vary by operation? Does an unsuccessful request consume capacity? A useful API documents those dimensions and makes the response headers agree with the enforcement path.

The same endpoint can have several budgets. An image-generation call might use a general request budget plus a more restrictive expensive-operation budget. In that case, expose the constraint that will block the next request; do not publish a comforting global number while a narrower policy is already exhausted.

## Do not turn hints into permission

Limit fields are observations, not a reservation. Another worker using the same credential can consume the remaining capacity before the next request arrives. Clients should still handle 429 and `Retry-After`, and servers should still enforce the limit atomically enough for the promised behavior.

This is where many client libraries become noisy. They treat every 429 as an invitation for every waiting task to retry at the same second. Add jitter, bound the queue, and prefer a local scheduler that sees the shared budget. A response header cannot rescue an unbounded producer.

## References

- [IETF HTTPAPI RateLimit header fields draft](https://github.com/ietf-wg-httpapi/ratelimit-headers/blob/9b4bc45c6be50e3e2455e9d6835b7537698d8ec4/draft-ietf-httpapi-ratelimit-headers.md), in the repository revision available before July 8, 2026, proposes quota policies and available quota hints. It is not a published RFC.
- [RFC 6585, section 4](https://www.rfc-editor.org/rfc/rfc6585#section-4) defines `429 Too Many Requests`.

## Final take

Rejection tells a client where the cliff is. A budget lets it choose a path that does not run over it.

## Changelog

- 2026-10-04T19:56:51-04:00: Recovered the 2026-07-08 scheduled slot. The retained run had started but produced no result, tools, or published source.
