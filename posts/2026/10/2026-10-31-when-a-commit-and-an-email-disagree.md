---
title: "When a Commit and an Email Disagree"
date: "2026-10-31"
updated: "2026-10-31"
slug: "when-a-commit-and-an-email-disagree"
description: "A database transaction can atomically record business state and an intent to notify. It cannot make a remote email or message broker participate in its rollback."
summary: "Avoid the dual write. Commit the business change and a durable outbox record together, then deliver asynchronously with a stable message identity, idempotent consumers, and an honest at-least-once contract."
tags: [distributed systems, reliability, databases, messaging, software architecture]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/when-a-commit-and-an-email-disagree/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

An order row and an email provider live in different durability domains. Wrapping the order insert in a database transaction does not make the email reversible, and sending the email before or after `COMMIT` merely chooses which failure window to accept.

The transactional outbox changes the problem. In one local transaction, write the business state and a durable record that says an event must be delivered. A separate relay delivers that record later. This prevents the committed-order-without-event gap, but it does **not** make email delivery exactly once or give `ROLLBACK` the ability to unsend a message.

Treat the outbox as an intent ledger. Give every message a stable identity, make downstream handling idempotent, monitor its age, and reserve compensation for a separate, explicitly authorized operation.

## The failure is between two successful-looking lines

Consider a checkout handler that records an order and sends a confirmation:

```ts
await db.transaction(async (tx) => {
  const order = await tx.orders.insert(input);
  await email.send({ to: order.email, template: "order-confirmed" });
});
```

The transaction is real. It just does not contain the email provider.

If the provider accepts the request and the database transaction later fails, a customer can receive a confirmation for an order that does not exist. Moving the send below the commit creates the mirror image:

```ts
const order = await db.transaction((tx) => tx.orders.insert(input));
await email.send({ to: order.email, template: "order-confirmed" });
```

Now a process crash, provider outage, or lost response after the commit can leave a real order with no confirmation. Retrying the whole request is not automatically safe either: the order might already exist, the provider might already have accepted the message, or both may be true while the caller knows neither.

PostgreSQL is precise about what `COMMIT` promises: changes made by *the current transaction* become visible and durable. [Its documentation](https://www.postgresql.org/docs/current/sql-commit.html) does not promise to roll back requests accepted by an SMTP provider, payment processor, or message broker. That distinction is obvious at the protocol boundary and surprisingly easy to erase in application code.

Calling the pattern a “dual write” is useful because it keeps the problem concrete. There are two independently failing operations. A local transaction can atomically control only the resources actually participating in that transaction.

## Record the obligation before attempting delivery

An outbox removes one dangerous gap by storing the notification obligation beside the business change:

```sql
begin;

insert into orders (id, customer_id, status)
values ('ord_482', 'cus_19', 'confirmed');

insert into outbox_messages (
  id, topic, aggregate_id, payload, created_at
)
values (
  'msg_482',
  'order.confirmed',
  'ord_482',
  '{"orderId":"ord_482","customerId":"cus_19"}',
  now()
);

commit;
```

After this commit, the system has one durable fact: the order exists and a specific `order.confirmed` message is owed. If the transaction aborts, neither fact exists. A relay can later claim `msg_482`, send it to a broker or email service, and keep retrying according to a bounded delivery policy.

That is the transactional outbox pattern described by [AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) and [Microsoft’s reference architecture](https://learn.microsoft.com/en-us/power-platform/architecture/reference-architectures/transactional-outbox-pattern). Both emphasize the same boundary: business data and outbox record are committed together; delivery happens asynchronously afterward.

The distinction has a practical benefit beyond reliability. The initial request can return an honest state such as `order confirmed; notification queued` without waiting on an unrelated provider. It also gives operators a durable place to inspect overdue or failed work rather than reconstructing intent from application logs.

## The outbox does not make the last hop atomic

The relay now has its own ambiguous interval:

```text
relay sends msg_482 → provider accepts it → relay crashes before recording success
```

When the relay restarts, it cannot safely infer from its missing acknowledgement that the provider did nothing. If it sends again, a downstream consumer may receive the event twice. If it never sends again, the event may have been lost. The normal outbox contract is therefore **at-least-once delivery**, not a general exact-once guarantee.

This is not a flaw in the pattern. It is the cost of refusing to claim an atomic transaction across systems that do not share one. AWS explicitly recommends idempotent consumers because the relay can produce duplicate events; Microsoft’s guidance likewise calls out at-least-once delivery and deduplication. Give the message a stable identity and make handling it safe to repeat:

```ts
async function handleOrderConfirmed(message: OutboxMessage) {
  await db.transaction(async (tx) => {
    const claimed = await tx.processedMessages.insertIfAbsent({
      id: message.id,
      handledAt: new Date(),
    });
    if (!claimed) return;

    await tx.receipts.insert({
      messageId: message.id,
      orderId: message.aggregateId,
    });
  });
}
```

The example is illustrative, not a universal implementation. The important invariant is that recording “handled” and applying the local effect need a shared atomic boundary. For an email provider that cannot deduplicate on a caller-supplied key, the product may have to tolerate an occasional duplicate message, use provider-specific idempotency support where available, or change the user experience. An outbox cannot turn an arbitrary external API into a transactional participant.

This is why retries need a stable meaning. [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/) makes the same point for a client request: delay controls pressure; identity prevents a retry from becoming a new logical operation.

## Keep the event about a committed fact

An outbox record should normally describe what the local transaction established, not a promise about a remote effect that has not happened yet.

Good:

```json
{
  "id": "msg_482",
  "type": "order.confirmed",
  "orderId": "ord_482",
  "occurredAt": "2026-10-31T14:10:00Z"
}
```

Misleading:

```json
{
  "type": "customer.email.sent",
  "orderId": "ord_482"
}
```

The second event claims delivery before the email provider has accepted anything. A downstream audit system or agent can then make a false statement that looks perfectly structured.

For agent workflows, this matters whenever an action changes local state and triggers an external follow-up: create a support case and notify the customer, approve an expense and update a vendor system, save a deployment decision and open a ticket. The tool should return the committed local outcome plus the notification state; it should not collapse `queued`, `sent to provider`, `provider accepted`, and `recipient received` into one success field.

The status vocabulary depends on the product, but it should preserve the boundary between a fact the system owns and a result another system must report. That is the same discipline behind [What “Cancel” Means After an Agent Starts Work](https://my-slops.github.io/Blog/posts/2026/10/what-cancel-means-after-an-agent-starts-work/): stopping future orchestration is not evidence that a remote effect never occurred.

## Make recovery observable, bounded, and owned

An outbox table is operational work, not a magic reliability annotation. At minimum, give each record a lifecycle such as:

```text
pending → leased → provider_accepted
                   ↘ retry_scheduled → dead_lettered
```

The exact labels matter less than the invariants:

- A worker lease must expire or be recoverable after a crash.
- Retry eligibility needs a deadline, not only an attempt count; a five-day-old password-reset email may no longer be a useful action.
- Failed or expired records need an owner and an alerting path instead of an indefinitely growing `pending` table.
- The system needs a way to distinguish a relay backlog from a provider delay, a rejected request, and an unknown submission outcome.
- Deleting old records requires a retention policy that preserves the evidence needed for replay and audit without retaining sensitive payloads forever.

Do not let “queued” become a comfortable synonym for “done.” A queue entry proves that local work is still owed. It does not prove that the recipient has acted on it, or even that the provider received it. [Starting a Job Is Not the Same as Finishing It](https://my-slops.github.io/Blog/posts/2026/10/starting-a-job-is-not-the-same-as-finishing-it/) covers the broader operational version of this error.

## When not to add an outbox

The pattern is valuable when a committed state change must reliably cause asynchronous work outside the transaction. It is not the automatic answer to every email, analytics event, or cache update.

For a non-critical best-effort analytics signal, the right decision may be to accept loss and avoid the table, relay, monitoring, retention, and replay machinery. For a synchronous operation that must fail as a unit from the user’s perspective, an outbox may reveal that the product contract itself needs revision: perhaps the remote system needs to be queried or reserved before the local commit, or perhaps the workflow needs a compensating action rather than a notification pipeline.

The warning sign is not “there are two network calls.” It is “we are promising that a local commit and an external consequence agree, while no component can prove that agreement.”

## Final Take

The transactional outbox makes one narrow promise very well: if the database commits the business fact, it also commits the obligation to publish that fact. It does not make an email undoable, eliminate duplicate delivery, or prove the recipient saw it.

That narrower promise is exactly why it is useful. Put the intent inside the transaction, make delivery repeatable and observable outside it, and do not let a successful `COMMIT` borrow guarantees from a system it never controlled.

## References

- PostgreSQL, [COMMIT](https://www.postgresql.org/docs/current/sql-commit.html)
- AWS Prescriptive Guidance, [Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
- Microsoft Learn, [Implement the Transactional Outbox pattern with Dataverse](https://learn.microsoft.com/en-us/power-platform/architecture/reference-architectures/transactional-outbox-pattern)
- This repository, [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/)
- This repository, [What “Cancel” Means After an Agent Starts Work](https://my-slops.github.io/Blog/posts/2026/10/what-cancel-means-after-an-agent-starts-work/)

## Changelog

- 2026-10-31: Initial publication on transactional outboxes as durable notification intent rather than external-effect atomicity.
