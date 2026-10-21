---
title: "Mixed-Version Deploys Are the Real Migration Test"
date: "2026-10-21"
updated: "2026-10-21"
created_at: "2026-10-21T10:00:00-04:00"
published_at: "2026-10-21T10:00:00-04:00"
scheduled_at: "2026-10-21T10:00:00-04:00"
slug: "mixed-version-deploys-are-the-real-migration-test"
description: "A migration is safe only across the application and schema versions that can coexist during rollout, retries, background work, and rollback. Test those combinations before production creates them for you."
summary: "A green migration against one freshly deployed application version misses the risky interval. Define the rollout states that can coexist, test reads and writes in each state, then remove compatibility only after the old paths are truly gone."
tags: [databases, deployment, reliability, testing, software maintenance]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/mixed-version-deploys-are-the-real-migration-test/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

The migration passes in staging. The new application starts. The new column exists. The deploy looks boring.

Then an old worker claims a job written by the new web tier, or a canary serves new code while most API nodes still run the previous release. The failure is not in the migration file. It is in the version pair that the test environment never created.

For a rolling deployment, the real unit of compatibility is not a schema or an application version in isolation. It is a pair: **this version of code, operating against this version of data and contracts**. A migration is safe only if every pair that can occur during the rollout is safe enough for the guarantees you make.

## Context

It is tempting to verify a change with one clean path:

```text
old code + old schema
        -> run migration
new code + new schema
```

That path demonstrates that the destination can work. It says little about the journey. Rolling deploys, canaries, queue workers, retries, and rollback all create intermediate states that a fresh environment does not model.

GitLab's deployment guidance makes the problem unusually explicit: during an update, new web nodes can enqueue work that old Sidekiq workers execute, and rolling deploys can leave nodes within one group on different versions for a while. Its example also calls out the reverse hazard: an older application can still write while a new schema is already present. [Their compatibility guide](https://docs.gitlab.com/development/multi_version_compatibility/) is worth reading because it describes these as ordinary deployment states, not exotic edge cases.

That observation changes the review question. Instead of asking, “Did the migration succeed?”, ask: “Which versions can exchange data or share storage before we declare this rollout complete?”

## The compatibility window is a product of deployment order

Suppose a service replaces `orders.state` with a more expressive `fulfillment_state`.

The unsafe version is easy to write:

```sql
ALTER TABLE orders RENAME COLUMN state TO fulfillment_state;
```

The statement may execute without error. But every still-running process that reads or writes `state` now has a production-only failure mode.

The safer shape is usually additive first:

```sql
ALTER TABLE orders ADD COLUMN fulfillment_state text;
```

Then release code that can understand both representations, backfill or dual-write according to an explicit rule, move readers to the new representation, and remove the old column only after the old code and old data paths are no longer reachable.

That sequence is often called expand and contract. The name is less important than the constraint it preserves: **a deployment step must not invalidate a counterpart that is still allowed to run.** GitLab documents the same three phases—expand, migrate, and contract—and notes that they must be separated when zero-downtime updates need compatibility across releases.

The exact order is not universal. A small service that stops all workers and accepts a maintenance window has a much smaller compatibility window. A fleet with a canary, asynchronous workers, mobile clients, and a rollback policy has a larger one. Do not copy a multi-release procedure by reflex. Derive it from the versions that can coexist in *your* system.

## Test the pairs your rollout permits

A practical migration review starts with a small matrix. The entries are not necessarily all required; they are a way to make the deployment assumptions inspectable.

| Code or producer | Schema / consumer / data shape | Question to test |
| --- | --- | --- |
| Old application | Expanded schema | Can old reads and writes continue after the pre-deploy change? |
| New application | Expanded schema with legacy rows | Does new code interpret old data correctly before backfill finishes? |
| Old worker or client | New message or API shape | Can it process work emitted by the new producer? |
| New application | Data written during the transition | Are dual writes, defaults, and backfills internally consistent? |
| Rolled-back application | Data created by new code | Is rollback supported, blocked, or accompanied by a recovery plan? |

The final row deserves more attention than it usually gets. “We can roll back the deployment” is not a useful promise if the new release has already written records the previous release cannot read. There are valid alternatives: keep the reader backward-compatible, delay irreversible writes, explicitly disable rollback after a cutover, or restore from a known recovery point. What is dangerous is calling rollback safe without choosing one.

This is related to [Schema Validation Does Not Prove a Migration Is Safe](https://my-slops.github.io/Blog/posts/2026/09/schema-validation-does-not-prove-a-migration-is-safe/), but the concern is different. That post is about a payload's meaning. The rollout matrix asks whether the systems that are simultaneously allowed to operate can still make correct decisions from the schema and messages they share.

## A migration test should include old data and old executors

Most test databases begin empty and most test queues are drained by the version under test. Both defaults erase the very transition you need to examine.

For the `fulfillment_state` change, a representative test has at least these fixtures:

```text
database:
  - rows with only state
  - rows with state and fulfillment_state agreeing
  - rows from a failed or partial backfill

executors:
  - a previous-release worker consuming a job from the new release
  - a new-release worker consuming a job emitted before the change
```

Then make the assertions behavioral. Does the old worker complete, reject visibly, or silently choose a different outcome? Does the new reader preserve the status of legacy orders? If one writer is retried during the backfill, can it overwrite a newer value?

Do not rely on a schema validator to answer those questions. Validation can show that a document has a permitted shape; it cannot establish that an old process understands a new enum, or that two writers apply the same precedence rule.

The same principle applies beyond tables. A renamed JSON property, a new queue argument, a cache-format change, and a changed interpretation of an environment variable can all become migration boundaries when independently deployed components exchange them. A green deployment of one service is weak evidence when another version remains a valid participant.

## Separate compatibility safety from database mechanics

Compatibility tests do not replace database-specific operational checks. They answer a different question.

For example, PostgreSQL documents that adding a column with a constant default can avoid updating every existing row at `ALTER TABLE` time, while a volatile default can require a lengthy update. It also notes that a new `NOT NULL` constraint checks existing data immediately. Those facts matter for lock time, load, and sequencing, but a fast DDL statement is not proof that old application code will supply the new value correctly. See the [PostgreSQL documentation on modifying tables](https://www.postgresql.org/docs/18/ddl-alter.html).

Review both dimensions separately:

1. **Engine safety:** locks, table rewrites, backfill rate, constraint validation, replica behavior, and recovery.
2. **Compatibility safety:** every reader, writer, worker, client, and rollback version that can meet during the rollout.

Conflating them leads to brittle conclusions. “The migration is online” may be true about locks while saying nothing about old workers. “The schema is backward-compatible” may be true for an `INSERT` while hiding a semantic mismatch in an API response.

## Make the cutoff an observable condition

The contract phase—dropping a field, rejecting an old message shape, deleting a fallback—is a separate production change. It needs evidence that the compatibility window has closed.

Useful evidence might include:

- the deployment controller reporting no old application revision remains eligible to serve;
- worker queues containing no jobs encoded for the old handler signature;
- mobile or external-client support policy reaching its announced cutoff;
- backfill completion being checked for correctness, not merely job completion; and
- a rollback decision recorded for the new data format.

This is the migration equivalent of [An API Deprecation Needs a Removal Test](https://my-slops.github.io/Blog/posts/2026/09/an-api-deprecation-needs-a-removal-test/). Keeping a fallback for one release does not prove that it is safe to delete. The removal should be tested against the absence of old consumers and old data paths, not inferred from a calendar date or a successful deploy.

For a modest application, this need not become a release bureaucracy. A short compatibility note beside the migration can be enough:

```text
Allowed during rollout:
  app v42 reads old and new rows
  app v43 writes both fields
  workers v42 and v43 accept the old job payload

Contract only after:
  v42 is absent from web and workers
  old-format jobs are drained or expired
  legacy rows are verified backfilled
  rollback to v42 is intentionally retired
```

The value is not the document. It is the decision that turns an accidental mixed-version period into a designed one.

## Trade-offs

Supporting two representations costs code, tests, observability, and eventually cleanup work. Dual writes can introduce drift if there is no declared source of truth. A long compatibility window can also turn temporary translation logic into permanent architecture.

That is a reason to bound the window and schedule the contract step, not a reason to pretend the window does not exist. For a tightly coordinated maintenance release, it may be entirely reasonable to stop the world and avoid dual compatibility. State that operational choice explicitly, test the stop and recovery path, and avoid promising rolling rollback semantics that the system does not have.

The most important boundary is honesty: only test pairs that your rollout actually permits, but test all of them. Inventing impossible combinations wastes time. Omitting ordinary ones creates the kind of incident that a one-version staging deployment can never reveal.

## References

- GitLab Docs, [Backwards compatibility across updates](https://docs.gitlab.com/development/multi_version_compatibility/)
- GitLab Docs, [Advanced search migration style guide: multi-version compatibility](https://docs.gitlab.com/development/search/advanced_search_migration_styleguide/#multi-version-compatibility)
- PostgreSQL Documentation, [Modifying tables](https://www.postgresql.org/docs/18/ddl-alter.html)
- This repository, [Schema Validation Does Not Prove a Migration Is Safe](https://my-slops.github.io/Blog/posts/2026/09/schema-validation-does-not-prove-a-migration-is-safe/)
- This repository, [An API Deprecation Needs a Removal Test](https://my-slops.github.io/Blog/posts/2026/09/an-api-deprecation-needs-a-removal-test/)

## Final Take

A migration is not finished when the newest code works against the newest schema. It is finished when the combinations your deployment can create are either compatible, deliberately prevented, or given a recovery path.

Before the next rollout, write down the old and new versions that can still meet. That is the test matrix production will use whether you define it or not.

## Changelog

- 2026-10-21: Initial publication.
