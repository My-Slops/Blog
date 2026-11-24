---
title: "The Riskiest Part of a Migration May Be Waiting for Its Lock"
date: "2026-11-24"
updated: "2026-11-24"
slug: "the-riskiest-part-of-a-migration-may-be-waiting-for-its-lock"
description: "A schema change can be quick once it holds its lock yet still cause an outage while it waits under production traffic. Treat lock acquisition as a bounded, observable deployment step."
summary: "For PostgreSQL migrations, the dangerous interval can be the wait for a table lock rather than the DDL execution itself. Use a migration-scoped lock timeout, diagnose blockers, and retry only an operation whose safety and compatibility story you understand."
tags: [databases, deployment, reliability, operations, software engineering]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/the-riskiest-part-of-a-migration-may-be-waiting-for-its-lock/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

A migration can take milliseconds after it receives the lock it needs and still be unsafe to run without a plan. Under live traffic, the consequential interval may be the time spent *waiting* for that lock.

In PostgreSQL, an ordinary `SELECT` takes an `ACCESS SHARE` lock, and many `ALTER TABLE` variants require `ACCESS EXCLUSIVE`. Those modes conflict. A report left inside a transaction, an application request that calls a remote service before committing, or an idle session that has not finished its transaction can make a seemingly tiny DDL change wait indefinitely. [PostgreSQL's locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html) describes both lock modes and their conflict.

Treat lock acquisition as its own deployment operation:

1. know the strongest lock the change needs;
2. bound how long the migration may wait to acquire it;
3. make a timeout a visible, non-destructive outcome; and
4. inspect the blocker before choosing whether and when to retry.

The objective is not “never let a migration fail.” It is “never turn an unbounded wait into an accidental production outage.”

## A quick DDL statement can have a long prelude

Imagine a deployment that adds a nullable column to a busy `invoices` table. In an empty staging database, the statement completes so quickly that it barely registers:

```sql
ALTER TABLE invoices ADD COLUMN review_note text;
```

It is tempting to classify that as an online change. But `ALTER TABLE` does not have one universal lock behavior. PostgreSQL says that the lock level varies by subcommand and that `ACCESS EXCLUSIVE` is used unless a particular form documents otherwise. `ACCESS EXCLUSIVE` conflicts with every table lock mode; an ordinary read uses `ACCESS SHARE`. [The `ALTER TABLE` reference](https://www.postgresql.org/docs/current/sql-altertable.html) and [lock-mode table](https://www.postgresql.org/docs/current/explicit-locking.html) are the authority here, not a migration checklist copied from another engine or PostgreSQL release.

Now add a request that begins a transaction, reads invoices, calls an external fraud provider, and waits 90 seconds for a response before it commits. The read can leave a conflicting table lock held until that transaction ends. The DDL waits.

That wait is not harmless simply because the DDL has not started changing the table. A pending schema change can become part of a larger lock dependency: application requests slow down, connection-pool capacity is consumed by sessions waiting on work, and the team sees timeouts far away from the migration command. The incident is often described as “the migration was slow,” even when the schema operation itself was fast.

The useful planning question is therefore not only:

> How long does this DDL execute?

It is also:

> What can already be holding a conflicting lock, and what does our service do while this request waits?

## Make the wait budget explicit

For a migration that is safe to abandon before it changes anything, set a short, migration-scoped lock timeout. For example:

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '45s';

ALTER TABLE invoices ADD COLUMN review_note text;

COMMIT;
```

`lock_timeout` applies while a statement waits to acquire a lock; `statement_timeout` limits the broader time from command arrival until completion. PostgreSQL recommends against setting either globally because different sessions have different needs. [Its configuration reference](https://www.postgresql.org/docs/current/runtime-config-client.html#RUNTIME-CONFIG-CLIENT-STATEMENT) also notes that a `lock_timeout` at least as large as `statement_timeout` adds no protection: the statement timeout fires first.

The numbers above are examples, not a prescription. A three-second tolerance may be sensible for a high-traffic table if the deployment can retry later. A controlled maintenance window may allow a longer wait. What matters is that the chosen budget reflects a decision about user-facing latency and not a default of “wait forever.”

A lock timeout is not evidence that the migration is bad. It says this attempt could not acquire the required boundary without exceeding its allowed disruption budget. That is often the correct result. The migration transaction aborts; no partial DDL from that transaction is committed; the deploy should report the failure clearly and stop before it treats the schema as changed.

Do not convert that outcome into a blind retry loop. If a long transaction blocks every attempt, automatic retries merely create repeating deployment noise. If a migration has application-level side effects outside the database, a retry may need a more specific idempotency and recovery design. First identify the condition that caused the wait.

## Find the session that is actually blocking you

PostgreSQL exposes waiting and held locks through `pg_locks`, which can be joined to `pg_stat_activity`. A row with `granted = false` represents a process waiting to acquire a lock. [The `pg_locks` reference](https://www.postgresql.org/docs/current/view-pg-locks.html) documents both the `granted` field and the join to activity information.

For an on-call investigation, `pg_blocking_pids` is usually a clearer starting point than trying to reconstruct a blocking graph from lock modes by hand:

```sql
SELECT
  waiting.pid AS waiting_pid,
  waiting.application_name AS waiting_application,
  waiting.query AS waiting_query,
  blocker.pid AS blocker_pid,
  blocker.usename AS blocker_user,
  blocker.application_name AS blocker_application,
  blocker.state AS blocker_state,
  blocker.xact_start AS blocker_transaction_started,
  blocker.query AS blocker_query
FROM pg_stat_activity AS waiting
CROSS JOIN LATERAL unnest(pg_blocking_pids(waiting.pid)) AS b(blocker_pid)
JOIN pg_stat_activity AS blocker ON blocker.pid = b.blocker_pid
WHERE waiting.wait_event_type = 'Lock';
```

The function reports sessions that hold a conflicting lock *or* are ahead in the lock wait queue. [PostgreSQL's system-information functions](https://www.postgresql.org/docs/current/functions-info.html) make that distinction explicit. That detail matters: the session immediately preventing progress may itself be waiting. Canceling the most visible statement without understanding the chain can leave the real cause intact.

The safe response depends on the blocker:

| Blocker | First response |
| --- | --- |
| An application request with an unexpectedly long transaction | Find why work crossed the transaction boundary; do not casually terminate a request that may be mid-effect. |
| A reporting or maintenance query | Ask whether it can finish, be canceled safely, or use a replica or different scheduling window. |
| A session `idle in transaction` | Investigate the owning client and its rollback/connection-pool behavior; it may also be retaining old row versions. |
| Another deployment or migration | Coordinate a single change order; concurrent deployers are a release-control failure, not a lock-tuning problem. |
| A prepared transaction | Escalate carefully. It can outlive its original client and holds locks until it is committed or rolled back. |

PostgreSQL also provides `idle_in_transaction_session_timeout` specifically to terminate sessions left idle inside an open transaction. Its documentation explains that these sessions can hold locks and can keep vacuum from removing tuples that might still be visible to them. That is useful hygiene, but it is not permission to set a universal timeout without checking how pooled clients recover from an unexpected connection close. [PostgreSQL configuration documentation](https://www.postgresql.org/docs/current/runtime-config-client.html#RUNTIME-CONFIG-CLIENT-STATEMENT)

## Separate the lock plan from the compatibility plan

Lock safety and rollout compatibility are related, but they are not substitutes for one another.

A change can obtain its lock immediately and still be unsafe because an old worker does not understand the new schema. It can also be perfectly compatible across old and new application versions yet be risky because it needs an `ACCESS EXCLUSIVE` lock at an uncontrolled time. The archive's earlier article, [Mixed-Version Deploys Are the Real Migration Test](https://my-slops.github.io/Blog/posts/2026/10/mixed-version-deploys-are-the-real-migration-test/), covers the former question: which versions can coexist and exchange data safely. This article concerns a different question: what happens while the database tries to establish the DDL boundary at all.

Review both before release:

| Question | Evidence to obtain |
| --- | --- |
| Which lock mode can this exact subcommand require? | The documentation for the deployed PostgreSQL version and migration form. |
| How long may it wait under live traffic? | A migration-local `lock_timeout` chosen for this table and deployment policy. |
| What will report a timeout? | A deploy result, alert, or runbook signal—not a hidden retry. |
| What sessions could be blockers? | A tested diagnostic query and enough activity metadata to identify the owner. |
| Can old code, jobs, and rollback coexist with the changed schema? | A compatibility matrix and representative transition tests. |

For a simple additive change, that review is short. For a rewrite, large backfill, constraint validation, or contract step, it should be more thorough. “It ran quickly on a copy of production” is useful evidence, but it has not exercised the lock holder that happens to be alive during the actual deploy.

## Test the unhappy acquisition path

Most migration tests prove only that the database accepts the statement. Add a small integration test—or at least a runbook rehearsal—for the condition that matters operationally:

```text
Given: one session is holding a transaction that has read the target table
And: the migration has a bounded lock timeout
When: the migration requests a conflicting table lock
Then: it fails before the disruption budget is spent
And: its transaction leaves no partial schema change
And: the deploy surfaces the blocked relation and retry decision
```

The test should use the lock mode required by the real migration. Do not assume every `ALTER TABLE` behaves alike, and do not simulate a blocking `SELECT` outside a transaction when the production risk is a long-running transaction that retains its lock.

There is an important boundary here. A timeout protects availability; it does not make a large operation cheap. A migration may acquire a lock promptly and then spend a long time rewriting data, validating a constraint, or increasing I/O. PostgreSQL's documentation for the specific DDL variant remains the starting point for assessing that work. A good release plan may need a staged backfill, an additive schema phase, a maintenance window, or a different feature design.

## Trade-offs

A short lock timeout increases the chance that a legitimate migration must be rescheduled. That is intentional friction: it favors current production traffic over forcing the database to wait until a convenient-looking moment that may never arrive.

Longer timeouts can be appropriate when the caller has made a clear maintenance promise and the team has a recovery plan. They are dangerous when treated as a substitute for understanding long-lived transactions. Likewise, terminating blockers can be necessary in an incident, but it is an operational action with application-level consequences—not a routine migration primitive.

The recommendation is not to make every schema change a ceremony. It is to make the most failure-prone hidden phase visible: lock acquisition. Once that wait has a budget, a diagnostic path, and a deliberate retry policy, a small DDL statement can remain small in production too.

## References

- PostgreSQL, [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- PostgreSQL, [`ALTER TABLE`](https://www.postgresql.org/docs/current/sql-altertable.html)
- PostgreSQL, [Client Connection Defaults: timeouts](https://www.postgresql.org/docs/current/runtime-config-client.html#RUNTIME-CONFIG-CLIENT-STATEMENT)
- PostgreSQL, [`pg_locks`](https://www.postgresql.org/docs/current/view-pg-locks.html)
- PostgreSQL, [System Information Functions: `pg_blocking_pids`](https://www.postgresql.org/docs/current/functions-info.html)
- This repository, [Mixed-Version Deploys Are the Real Migration Test](https://my-slops.github.io/Blog/posts/2026/10/mixed-version-deploys-are-the-real-migration-test/)

## Final Take

The most important moment in a production migration may occur before the schema changes at all. It is the moment the database asks existing work to make room.

Budget that request, observe who declined it, and retry only after you understand why. A migration that gives up safely is often healthier than one that waits until the rest of the system gives up first.

## Changelog

- 2026-11-24: Initial publication.
