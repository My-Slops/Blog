---
title: "An ETag Is a Version Boundary, Not a Cache Decoration"
date: "2026-06-12"
updated: "2026-06-12"
created_at: "2026-06-12T10:00:00-04:00"
published_at: "2026-06-12T10:00:00-04:00"
scheduled_at: "2026-06-12T10:00:00-04:00"
slug: "an-etag-is-a-version-boundary-not-a-cache-decoration"
description: "HTTP entity tags are useful for more than bandwidth: they let a client refuse to overwrite a representation it has not actually seen."
summary: "Use ETags with If-Match for optimistic concurrency. A version boundary turns stale writes into visible conflicts instead of quiet data loss."
tags: [HTTP, APIs, concurrency]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/an-etag-is-a-version-boundary-not-a-cache-decoration/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

Two browser tabs load the same profile. One changes the display name; the other changes a notification preference and sends the whole document back. If the server accepts both `PUT`s unconditionally, the second tab can erase the first tab's edit without either user noticing.

That is not a caching problem. It is a missing version boundary.

An HTTP `ETag` identifies a representation version. `If-None-Match` is the familiar cache use, but `If-Match` carries the more consequential contract: perform this mutation only if the representation is still the version I read.

```http
GET /profiles/42
ETag: "profile-42-v17"

PUT /profiles/42
If-Match: "profile-42-v17"
Content-Type: application/json
```

If another update has made the current tag `v18`, the server returns `412 Precondition Failed`. That is a good failure. It tells the product to merge, refresh, or ask the user rather than pretending that an overwrite was a normal save.

## The tag must follow representation semantics

Do not calculate a tag from whatever database timestamp happens to be convenient if that timestamp does not change for every visible change. Do not reuse a tag across representations that differ by locale, permissions, or fields. A strong ETag promises byte-level representation identity; a weak ETag (`W/`) is only suitable where semantic equivalence is enough.

For write protection, keep the contract simple: issue a version token with the editable representation, require it for replacement, and advance it in the same transaction as the update. The token can be a sequence number, UUID, or carefully scoped hash. It does not need to be clever.

```sql
update profiles
set preferences = $new_preferences,
    version = version + 1
where id = $id and version = $expected_version;
```

Zero affected rows is not merely a database detail. It is the stale-write result that the HTTP layer should preserve.

## Where this does not fit

Partial commands such as “add one item to this cart” often need a command-specific idempotency key, not replacement-style versioning. High-conflict collaborative editors need a merge model rather than making every conflict a dead end. Still, neither exception justifies silent last-writer-wins for an ordinary settings form.

## References

- [RFC 9110, section 8.8.3](https://www.rfc-editor.org/rfc/rfc9110#section-8.8.3) defines entity tags.
- [RFC 9110, section 13.1.1](https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1) defines `If-Match` as a precondition for preventing lost updates.

## Final take

Cache validation saves bytes. Version validation saves intent. Use the same HTTP primitive for both, but do not mistake the smaller benefit for the important one.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-06-12 scheduled slot after a date-bounded archive and source review.
