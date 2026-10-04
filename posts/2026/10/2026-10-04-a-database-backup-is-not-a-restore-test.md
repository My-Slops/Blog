---
title: "A Database Backup Is Not a Restore Test"
date: "2026-10-04"
updated: "2026-10-04"
created_at: "2026-10-04T10:00:00-04:00"
published_at: "2026-10-04T10:00:00-04:00"
scheduled_at: "2026-10-04T10:00:00-04:00"
slug: "a-database-backup-is-not-a-restore-test"
description: "A completed backup proves that bytes were written somewhere. Only a restore into a usable environment proves that the backup can recover the system you depend on."
summary: "Test restoration on a schedule, verify application-level invariants afterward, and measure recovery time. A green backup job is not evidence of recoverability."
tags: [databases, reliability, operations]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/a-database-backup-is-not-a-restore-test/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

“Backup completed” means a backup process wrote an artifact. It does not mean the artifact has the data you expect, can be decrypted, matches the target engine version, recreates the required roles, or restores within the time your business can tolerate.

Recovery is a workflow, not a file.

## Restore into a fresh target

The minimal meaningful exercise starts with an isolated, empty environment. Obtain the backup through the same access path that would exist during an incident. Restore it using the documented tooling. Start the application against it. Then check a few application-level invariants rather than stopping at a successful command exit.

```text
restore completed
schema version matches expected release
required roles and extensions exist
known customer record and related objects are present
application health check passes
```

The last two checks matter because a database can contain every table yet still be operationally incomplete: an object owner may be missing, an extension unavailable, a key inaccessible, or a background migration not applied.

## Measure the recovery you promise

Time the entire procedure: locating credentials, provisioning the target, transferring the backup, restoring it, applying needed configuration, and validating the application. That duration is evidence for a recovery-time objective. Measuring only `pg_restore` makes the number look better while omitting the human and infrastructure steps that dominate a real incident.

Also verify the recovery-point objective. A daily full backup cannot promise data from five minutes before a failure unless a separate log or incremental strategy covers that interval. Be explicit about the gap; a vague “we have backups” statement is where false confidence begins.

## Keep the test safe

Use an isolated account and network boundary. Production backup data may contain sensitive information, so a restore drill needs retention, access, and cleanup controls. Do not let the need to protect data become the reason restoration is never tested; make the drill safe enough to repeat.

## References

- [PostgreSQL documentation: Backup and Restore](https://www.postgresql.org/docs/16/backup.html) describes logical backups and restoration tooling.
- [PostgreSQL documentation: `pg_restore`](https://www.postgresql.org/docs/16/app-pgrestore.html) documents restore behavior, including ownership and privilege considerations.

## Final take

A backup is a claim about stored bytes. A restore test is evidence that you can return a system to service.

## Changelog

- 2026-10-04T19:56:51-04:00: Recovered the 2026-10-04 scheduled slot after confirmed stream disconnection before any result or published source.
