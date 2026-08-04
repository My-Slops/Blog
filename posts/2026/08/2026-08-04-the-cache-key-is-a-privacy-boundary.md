---
title: "The Cache Key Is a Privacy Boundary"
date: "2026-08-04"
updated: "2026-08-04"
created_at: "2026-08-04T10:00:00-04:00"
published_at: "2026-08-04T10:00:00-04:00"
scheduled_at: "2026-08-04T10:00:00-04:00"
slug: "the-cache-key-is-a-privacy-boundary"
description: "A cache key decides which requests may share a response. Leaving out a representation-changing input can become a data exposure."
summary: "Treat cache-key design as authorization design: every input that changes a permitted response must be represented or the response must not be shared."
tags: [security, HTTP, caching]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/the-cache-key-is-a-privacy-boundary/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

A cache is allowed to reuse a response only when the next request is entitled to the same representation. That makes the cache key a privacy boundary, not an implementation footnote.

The classic mistake is a personalized endpoint cached by path alone:

```text
GET /account/summary
cache key: /account/summary
```

The first authenticated response may now be returned to the next authenticated user. The bug does not require a broken access-control check. It comes from applying correct access control before the cache and then forgetting which identity made the resulting representation valid.

## Enumerate representation inputs

Before making a response shareable, list every input that can change it:

- authenticated principal or tenant,
- authorization scopes and feature entitlements,
- locale or content negotiation,
- query parameters,
- experiment assignment,
- request headers named by `Vary`.

If including an input in a shared key is infeasible or unsafe, mark the response private or do not cache it at that layer. `Vary: Cookie` is not a free solution: it can destroy cache efficiency and still relies on intermediaries honoring the contract. A server-side cache keyed by a stable internal authorization context may be safer than an edge cache trying to infer it from arbitrary headers.

## The dangerous optimization

Teams often remove a key dimension after seeing a high cache-cardinality metric. That can be a legitimate performance trade-off for a non-sensitive representation. It is not legitimate when the dropped dimension changes what the requester is allowed to learn.

Write down the intended equivalence class instead: “these two requests may receive the same bytes because they have the same public product page in the same language.” That statement is reviewable. “We cache by URL” is not.

## References

- [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111) specifies cache reuse and the `Vary` mechanism.
- [MDN: Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) documents `private` and shared-cache directives.

## Final take

Cache keys partition who may share an answer. Treat changes to them with the same suspicion you would apply to changes in authorization logic.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-08-04 scheduled slot; the topic is a novel security-and-HTTP angle relative to the archive.
