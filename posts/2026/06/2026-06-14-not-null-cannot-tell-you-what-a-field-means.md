---
title: "NOT NULL Cannot Tell You What a Field Means"
date: "2026-06-14"
updated: "2026-06-14"
created_at: "2026-06-14T10:00:00-04:00"
published_at: "2026-06-14T10:00:00-04:00"
scheduled_at: "2026-06-14T10:00:00-04:00"
slug: "not-null-cannot-tell-you-what-a-field-means"
description: "Database constraints enforce structural facts, but a required column can still encode an ambiguous or changing business promise."
summary: "A non-null database value is not a semantic contract. Name units, ownership, lifecycle, and interpretation at the boundary where data acquires meaning."
tags: [databases, data modeling, API design]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/not-null-cannot-tell-you-what-a-field-means/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

`NOT NULL` is one of the most valuable constraints in a database. It is also surprisingly easy to over-credit.

Consider a required `amount` column. The database can guarantee that every row contains a number. It cannot tell whether the number is cents or dollars, gross or net, a quote or a settled charge, or which currency makes it meaningful. All of those rows can satisfy `NOT NULL` while disagreeing about the product.

The failure usually appears later as an “integration bug”: one service emits `amount: 1250`, another assumes 1250 dollars, and an analytics job sums values from both. The schema was valid. The data model was not.

## Constraints have a boundary

Use database constraints for facts the database can actually enforce: presence, range, uniqueness, referential identity, and a finite state set. Then carry semantic premises explicitly.

```sql
create table invoice_lines (
  invoice_id uuid not null references invoices(id),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null,
  pricing_basis text not null check (pricing_basis in ('quoted', 'settled'))
);
```

`amount_minor` says more than `amount`; `currency` prevents an otherwise invisible unit mismatch; `pricing_basis` makes a lifecycle distinction queryable. None is decorative metadata. Each stops a plausible but wrong interpretation.

The API boundary needs the same discipline. A JSON schema can verify that `currency` is a string of three characters. It cannot decide whether the sender is allowed to use a currency that the account has disabled, or whether the amount belongs to the account's negotiated price list. Those are business invariants, and they deserve named validation in the domain layer.

## Avoid encoding “unknown” as a normal value

Teams often make a required field by substituting a sentinel: `0`, `"N/A"`, `1970-01-01`, or a fake foreign key. That turns absence into data and forces every reader to remember a private exception. Prefer an explicit nullable state while information is genuinely unavailable, or split the workflow so a record cannot enter a later state until required facts exist.

The right constraint is often temporal: “a draft may omit a tax code; an issued invoice may not.” A single `NOT NULL` at table creation cannot express that lifecycle by itself.

## References

- [PostgreSQL documentation: Constraints](https://www.postgresql.org/docs/16/ddl-constraints.html) explains the structural guarantees available to relational schemas.
- [JSON Schema 2020-12 validation](https://json-schema.org/draft/2020-12/json-schema-validation.html) specifies structural JSON validation, not product semantics.

## Final take

A required value is evidence that something was supplied, not evidence that everyone will read it the same way. Model the missing meaning before it becomes a production convention.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-06-14 scheduled slot; no retained publishable draft existed.
