---
title: "The Quarantine Table Is Part of the Importer"
date: "2026-06-20"
updated: "2026-06-20"
created_at: "2026-06-20T10:00:00-04:00"
published_at: "2026-06-20T10:00:00-04:00"
scheduled_at: "2026-06-20T10:00:00-04:00"
slug: "the-quarantine-table-is-part-of-the-importer"
description: "A data import that discards malformed records or fails an entire batch is missing the operational path needed to repair real input."
summary: "Preserve rejected input with its reason, source position, and batch identity. Quarantine makes partial progress auditable and repairable."
tags: [data engineering, reliability, databases]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-quarantine-table-is-part-of-the-importer/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

An import of 500,000 rows has three bad postal codes. “Fail the batch” turns a small data problem into an operations outage. “Skip invalid rows” turns it into silent loss.

Neither outcome is acceptable when the input is business data. The importer needs a third destination: a quarantine record that retains the original row, why it failed, where it came from, and which import run observed it.

```sql
create table import_rejections (
  batch_id uuid not null,
  source_row_number integer not null,
  raw_record jsonb not null,
  error_code text not null,
  error_detail text not null,
  rejected_at timestamptz not null default now(),
  primary key (batch_id, source_row_number)
);
```

This is not a graveyard. It is an interface between automation and the person or system able to correct the source.

## Partial success needs a receipt

The batch result should report counts that add up:

```text
batch=7e2… accepted=499,997 rejected=3 duplicate=0
```

Without those numbers, a green job status is nearly meaningless. A batch can “succeed” while dropping the rows that mattered most. Conversely, a job can return a nonzero quality status while safely loading every valid record. The caller needs both the transport outcome and the data outcome.

Keep parsing separate from applying changes. First record the raw input and parse errors; then validate domain rules; then apply accepted records in controlled transactions. This makes reprocessing possible after a mapping bug is fixed. It also avoids the tempting but dangerous practice of asking the upstream provider to resend a file that was already partially consumed.

## Do not quarantine secrets by accident

Raw records can contain personal data, credentials, or payment details. Retention, access controls, and redaction need the same design attention as the happy path. Sometimes a cryptographic reference to an encrypted source object is safer than copying a raw payload into an application table. The principle is preservation of repair evidence, not indiscriminate duplication.

## References

- [PostgreSQL documentation: `COPY`](https://www.postgresql.org/docs/16/sql-copy.html) describes row-level error handling limits and the distinction between loading mechanics and application validation.
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457) provides a standard vocabulary for machine-readable error details.

## Final take

The hard part of an importer is not recognizing a valid row. It is giving an invalid row a safe, inspectable place to wait.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-06-20 scheduled slot after reviewing the pre-slot archive and durable primary sources.
