---
title: "Parallel Workers Can Overtake the Oldest Job"
date: "2026-11-13"
updated: "2026-11-13"
slug: "parallel-workers-can-overtake-the-oldest-job"
description: "A database queue that uses FOR UPDATE SKIP LOCKED can keep workers moving, but it deliberately stops being a strict FIFO queue. Model priority, recovery, and fairness rather than inferring them from created_at."
summary: "FOR UPDATE SKIP LOCKED is a practical way for concurrent workers to claim different rows without waiting on each other. It also lets later jobs pass a locked earlier job, so FIFO order, fairness, and recovery need an explicit design outside the locking clause."
tags: [databases, queues, distributed systems, reliability, software architecture]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/parallel-workers-can-overtake-the-oldest-job/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

`FOR UPDATE SKIP LOCKED` is a useful building block for a database-backed work queue. Several workers can look for ready jobs at the same time; instead of waiting on a job another worker has claimed, each worker can move on to another row.

That progress comes from an intentional relaxation: a job that was ready first can be overtaken while it is locked. PostgreSQL explicitly describes `SKIP LOCKED` as producing an inconsistent view and positions it for queue-like tables, not general-purpose reads. [Its `SELECT` documentation](https://www.postgresql.org/docs/current/sql-select.html) is unusually clear on this point.

Use the trade when independent jobs can safely run out of order. Do not mistake `ORDER BY created_at` for a fairness guarantee. A durable queue needs an explicit claim lease, recovery path, ordering scope, and measurements for jobs that are repeatedly skipped or never finish.

## The fast queue is not necessarily a FIFO queue

Consider three ready jobs, ordered by creation time:

```text
09:00  invoice-17     worker A has claimed it
09:01  invoice-18     ready
09:02  invoice-19     ready
```

Worker B asks for the oldest ready job:

```sql
select id
from jobs
where state = 'ready'
order by created_at, id
for update skip locked
limit 1;
```

It does not wait for `invoice-17`. It skips that locked row and receives `invoice-18`. A third worker can receive `invoice-19`. That is the point: workers do useful work instead of forming a lock-wait chain behind a slow claim.

But `created_at` now describes the preferred candidate among rows immediately claimable by this transaction. It does not describe a promise that no later job will run first.

The distinction gets lost because the query visibly contains `ORDER BY created_at`. PostgreSQL recommends an `ORDER BY` with `LIMIT` when a query needs a deterministic subset, but its locking documentation separately says that `SKIP LOCKED` skips rows that cannot be locked immediately and produces an inconsistent view. The order is real; so is the exception to it.

For independent image transformations or cache refreshes, that exception is normally excellent. If an older refresh is slow, later unrelated work can proceed. For jobs that modify one customer's balance, reserve inventory, or apply events for one aggregate, the exception may violate the product's actual ordering rule.

## Claim briefly, then do work outside the lock

The most consequential mistake is holding the database transaction open while performing the job. A network call, PDF render, or slow provider response then keeps the row locked for the entire execution. Other workers skip it, and the system may appear healthy because throughput continues around the stuck work.

Prefer a short transaction that turns a ready row into an owned, recoverable claim:

```sql
begin;

with next_job as (
  select id
  from jobs
  where state = 'ready'
    and run_after <= now()
  order by priority desc, run_after, id
  for update skip locked
  limit 1
)
update jobs
set state = 'running',
    claimed_by = :worker_id,
    claim_token = :claim_token,
    claim_expires_at = now() + interval '5 minutes',
    attempt_count = attempt_count + 1
where id in (select id from next_job)
returning id, payload, claim_token;

commit;
```

The worker performs the external effect after the commit. When it writes the outcome, it should require the same claim token:

```sql
update jobs
set state = 'completed', completed_at = now()
where id = :job_id
  and state = 'running'
  and claim_token = :claim_token;
```

This is not a complete job system. It is a boundary between **claiming a job** and **doing a job**. PostgreSQL row locks last until the transaction ends, so keeping the claim transaction short reduces contention and makes the recovery state visible to other workers. [PostgreSQL's locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html) also notes that a `FOR UPDATE` lock prevents concurrent lockers, modifiers, and deleters of that row until the transaction ends.

The claim token matters after a recovery worker decides that an expired claim is eligible again. A late original worker must not be able to mark a job complete after another worker has reclaimed it. The same stale-worker problem appears in [A Lease Expiry Does Not Stop the Old Worker](https://my-slops.github.io/Blog/posts/2026/11/a-lease-expiry-does-not-stop-the-old-worker/): recovering coordination does not revoke a process that is still running.

## “Ready” and “runnable now” are different states

Many queues have only a boolean-shaped model: pending versus done. That makes skipped or abandoned work hard to explain.

At minimum, distinguish these questions:

| Field or state | Question it answers |
| --- | --- |
| `state = 'ready'` | Has the system accepted this job for future work? |
| `run_after` | Is this job eligible to be claimed now? |
| `claimed_by` and `claim_token` | Which worker currently owns this attempt? |
| `claim_expires_at` | When may recovery consider the ownership stale? |
| `attempt_count` and `last_error` | Is automatic retry still safe or useful? |
| `priority` or partition key | Which work may overtake which other work? |

These are product decisions, not fields required by PostgreSQL. A queue for welcome emails may allow a later customer's email to run first. A queue for a single account's ledger may need an account partition and a sequence check that prevent it. A global `created_at` column cannot represent both policies.

There is a useful middle ground between a single globally serialized worker and unbounded parallelism: make the ordering scope match the business entity. For example, claims can be parallel across accounts while a unique running slot or monotonically checked version protects the order within one account. That preserves the concurrency that `SKIP LOCKED` provides without claiming global FIFO when the product only needs local order.

## A skipped row is an operational signal

`SKIP LOCKED` removes lock waiting from the worker's critical path. It does not tell an operator why a row was locked, whether the owner is alive, or whether the effect was already performed.

Treat these as queue health signals, not edge cases:

- age of the oldest `ready` job, by priority and partition;
- age and count of `running` jobs past their claim expiry;
- claim attempts and terminal outcomes for each job class;
- jobs recovered after an expired claim; and
- the difference between a queue with no claimable rows and one with many ready rows that no worker can complete.

Those distinctions matter during an incident. A worker can report successful polls while the oldest high-priority job is stranded behind a long-running claim. “Consumers are active” is weaker evidence than “the intended work is reaching a terminal state.” The same evidence gap is central to [A Log Line Cannot Prove a Message Was Processed](https://my-slops.github.io/Blog/posts/2026/09/a-log-line-cannot-prove-a-message-was-processed/).

Recovery should be a state transition with an audit trail, not a blind `update jobs set state = 'ready'`. Record why a claim was considered expired, increment or preserve the attempt count deliberately, and ensure that the job's downstream effect can tolerate a duplicate or be reconciled. [Replaying a Dead-Letter Queue Is a New Production Change](https://my-slops.github.io/Blog/posts/2026/11/replaying-a-dead-letter-queue-is-a-new-production-change/) covers the larger rule: old work becomes a new production change when it is attempted again.

## When waiting is the honest behavior

`SKIP LOCKED` is not automatically the safer option. Waiting is often right when a later operation must not pass an earlier one.

Suppose a job represents sequence number 42 for one account and 43 cannot be applied until 42 succeeds. Letting a worker skip 42 and apply 43 does not make the system more available; it creates invalid state that has to be repaired later. In that case, claim by partition, block that partition behind its predecessor, or use a different queue whose ordering contract is explicit.

Likewise, a database table is not always the right broker. A high-volume workload may need fan-out, long retention, independent consumer groups, or scheduling semantics that a purpose-built queue provides more directly. A database-backed queue is attractive when transactional insertion, operational simplicity, and modest throughput matter more than those features.

The question is not whether workers should ever overtake each other. It is which work is independent enough to permit it, and how the system will prove that a skipped or expired job has not been forgotten.

## Test the overtake deliberately

Queue tests often verify only that two workers do not process the same row. Add the behaviors that make the ordering trade visible:

```text
Given: worker A has claimed the oldest job and has not finished
When: worker B claims work using SKIP LOCKED
Then: B receives a later independent job, not a lock wait

Given: two jobs belong to the same ordered account
When: the first is claimed but not completed
Then: the second cannot produce its effect before the first

Given: a worker dies after the claim transaction commits
When: claim_expires_at passes and recovery runs
Then: a new claim has a new token and the old worker cannot complete it

Given: a job exceeds its retry policy
When: recovery sees the expired claim
Then: the job moves to a visible terminal or review state, not silently back to ready
```

The first test proves the throughput benefit. The other three prove that the benefit did not become an undocumented ordering, ownership, or retry policy.

## References

- PostgreSQL, [SELECT: the locking clause](https://www.postgresql.org/docs/current/sql-select.html)
- PostgreSQL, [Explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- This repository, [A Lease Expiry Does Not Stop the Old Worker](https://my-slops.github.io/Blog/posts/2026/11/a-lease-expiry-does-not-stop-the-old-worker/)
- This repository, [A Log Line Cannot Prove a Message Was Processed](https://my-slops.github.io/Blog/posts/2026/09/a-log-line-cannot-prove-a-message-was-processed/)
- This repository, [Replaying a Dead-Letter Queue Is a New Production Change](https://my-slops.github.io/Blog/posts/2026/11/replaying-a-dead-letter-queue-is-a-new-production-change/)

## Final Take

`SKIP LOCKED` is valuable because it lets independent work avoid each other's lock waits. That is a throughput decision, not a fairness algorithm.

Adopt it when overtaking is safe. Then make ownership, expiry, recovery, priority, and any required ordering visible in the job model. If the queue needs FIFO for a particular entity, encode that entity's rule; `ORDER BY created_at` cannot enforce it once workers are allowed to skip.

## Changelog

- 2026-11-13: Initial publication on queue ordering and `SKIP LOCKED` claim semantics.
