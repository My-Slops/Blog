---
title: "Schema Validation Does Not Prove a Migration Is Safe"
date: "2026-09-10"
updated: "2026-09-10"
created_at: "2026-09-10T10:00:00-04:00"
published_at: "2026-09-10T10:00:00-04:00"
scheduled_at: "2026-09-10T10:00:00-04:00"
slug: "schema-validation-does-not-prove-a-migration-is-safe"
description: "A payload can satisfy both an old and new schema while still changing the behavior that consumers rely on."
summary: "Schema validation catches shape errors, not semantic compatibility. Test migrations against representative old data and the decisions consumers make from it."
tags: [API design, data contracts, testing]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/09/schema-validation-does-not-prove-a-migration-is-safe/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

Changing `status: "active"` into `status: "enabled"` can be schema-valid on both sides of a migration. It can also quietly stop every old consumer from granting access.

Schemas answer a narrow and valuable question: is this document shaped like the declared contract? They do not establish that a new field has the same business meaning, that a default preserves old behavior, or that a consumer's branch logic reaches the same outcome.

## Compatibility is a behavioral claim

Suppose a producer replaces a missing boolean with an explicit default:

```json
// old record
{ "send_receipts": false }

// new producer's intended default
{ "send_receipts": true }
```

Both records may validate. The migration is still breaking if consumers previously interpreted absence or `false` as an opt-out. The question is not “does the JSON parse?” It is “does a record produced before and after the change produce the intended decision?”

Keep a fixture corpus of historic payloads, including records with omitted fields, deprecated enum values, and surprising but accepted combinations. Run the new reader against them. For a stateful migration, use a copy of the oldest supported database and execute the actual migration chain; a schema created from scratch misses ordering and backfill defects.

## Make ambiguity explicit at the boundary

If a new interpretation needs a new policy, name it. Do not overload a familiar field and expect every downstream system to discover the nuance on its own. Versioning can help, but a version number is not compatibility by itself; it only makes the difference detectable.

## References

- [JSON Schema validation specification](https://json-schema.org/draft/2020-12/json-schema-validation.html) defines validation keywords and their structural scope.
- [PostgreSQL documentation: `ALTER TABLE`](https://www.postgresql.org/docs/16/sql-altertable.html) documents schema operations; application compatibility remains an additional responsibility.

## Final take

Passing a schema is evidence that data has a permitted shape. A safe migration needs evidence that the system still makes the right decisions from that shape.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-09-10 scheduled slot after a fresh historical editorial review.
