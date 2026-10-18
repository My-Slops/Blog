---
title: "A Webhook Retry Must Not Become a New Snapshot"
date: "2026-10-18"
updated: "2026-10-18"
slug: "a-webhook-retry-must-not-become-a-new-snapshot"
description: "A failed webhook delivery should repeat the original event, not rebuild its body from a resource that has changed since the event occurred."
summary: "Keep event facts separate from delivery attempts. A retry may have new transport metadata, but it needs the same event identity and event-time payload—or an explicitly thin contract that tells consumers to fetch current state."
tags: [event systems, API design, reliability, developer tooling]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/a-webhook-retry-must-not-become-a-new-snapshot/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

A failed webhook delivery is an attempt to deliver an existing event. It is not permission to look up the resource again and construct a different event body.

If `invoice.paid` originally said an invoice was paid for $120, a retry after the invoice is later voided should not arrive as `invoice.paid` with `status: "void"`. Consumers that received the first attempt and consumers that received the retry would be asked to process different facts under the same event identity.

Persist the event envelope and its event-time payload before delivery. Keep delivery-specific facts—attempt number, timestamp, endpoint, response, and signature—on a separate record. A thin notification that deliberately tells the receiver to fetch current state is also valid, but it is a different contract and should say so plainly.

## Context

An order service records that order `ord_184` was paid. Its webhook worker POSTs this payload:

```json
{
  "id": "evt_7f3",
  "type": "invoice.paid",
  "occurredAt": "2026-10-18T13:00:00Z",
  "data": {
    "invoiceId": "in_184",
    "status": "paid",
    "amount": 12000,
    "currency": "usd"
  }
}
```

The receiving endpoint times out after reading the body. Ten minutes later, a support agent voids the invoice. The delivery worker retries by querying the current invoice row and serializing it again:

```json
{
  "id": "evt_7f3",
  "type": "invoice.paid",
  "occurredAt": "2026-10-18T13:00:00Z",
  "data": {
    "invoiceId": "in_184",
    "status": "void",
    "amount": 12000,
    "currency": "usd"
  }
}
```

That second body is not a retry. It is a new snapshot wearing an old event ID. A receiver that did not get the first attempt now sees an impossible-looking fact; a receiver that did get it cannot safely use the ID for deduplication because the same ID now has two meanings. Audit trails, signatures, payload hashes, and incident reconstruction all become less trustworthy for the same reason: the producer never decided what `evt_7f3` was meant to mean.

The CloudEvents specification gives the useful starting point. It describes an event as a record of an occurrence and says a duplicate resent after a network error may keep the same `source` and `id`; consumers may treat that pair as a duplicate. [CloudEvents 1.0](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md) does not prescribe a delivery system, but that duplicate rule only helps if the event identity continues to name the same occurrence.

## Key Points

### Event time and delivery time are different clocks

An event has facts about the source occurrence. A delivery has facts about one effort to transmit it. They should not be collapsed into one mutable JSON document.

| Record | Facts it owns | May change on retry? |
| --- | --- | --- |
| Event | ID, type, source, occurrence time, schema version, event payload | No, except a deliberate correction policy that creates a new event |
| Delivery attempt | endpoint, attempt number, send time, response status, transport error, signature | Yes |

The byte representation may legitimately differ when a protocol adds a request timestamp, nonce, or fresh signature. The semantic event envelope and body must not be regenerated from current state. Store a content hash of the canonical serialized event if exact replay matters to the contract; store each transport artifact beside the delivery attempt.

This distinction also keeps metrics honest. `event_created_total` measures source occurrences. `webhook_delivery_attempt_total` measures transport work. A spike in the latter during an endpoint outage should not make it look as if the business suddenly created more invoices.

GitHub's webhook guidance illustrates the separation at the delivery layer: its `X-GitHub-Delivery` value can identify a delivery, and a requested redelivery keeps that header value. The receiver still needs to handle retries and respond quickly enough to avoid creating them. [GitHub's webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks) are intentionally about delivery behavior, not a license to reinterpret the underlying event.

### Persist the fact before the worker tries to send it

The fragile implementation builds a webhook in the retry loop:

```ts
// Do not let a retry query mutable state to recreate a past event.
async function deliverAgain(eventId: string) {
  const event = await events.find(eventId);
  const invoice = await invoices.find(event.invoiceId);
  return post(event.endpoint, {
    id: event.id,
    type: event.type,
    data: invoice,
  });
}
```

The durable boundary belongs at the state transition that produced the event. In a transactional-outbox design, commit a canonical event record with the business update, then let delivery attempts reference that record:

```ts
type StoredEvent = {
  id: string;
  source: "billing";
  type: "invoice.paid";
  occurredAt: string;
  schema: "https://api.example.com/events/invoice.paid/v1";
  payload: Readonly<{ invoiceId: string; amount: number; currency: string }>;
  payloadHash: string;
};

async function markInvoicePaid(invoiceId: string) {
  await db.transaction(async (tx) => {
    const invoice = await tx.invoices.markPaid(invoiceId);
    const event = makeInvoicePaidEvent(invoice); // captures event-time data
    await tx.outbox.insert(event);
  });
}

async function deliver(eventId: string, endpoint: string) {
  const event = await db.outbox.get(eventId);
  const attempt = await db.deliveryAttempts.start({ eventId, endpoint });
  return post(endpoint, serialize(event), { attemptId: attempt.id });
}
```

The example does not promise a distributed transaction with the receiver. The outbox gives the sender one durable fact to retry; the receiver still needs idempotent processing. [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/) covers why a retry cannot be made safe by delay alone.

### A thin notification is valid, but it is not a snapshot event

There are two coherent webhook contracts. Problems start when a service accidentally offers both at once.

**Snapshot event:** The payload is a representation of the occurrence at event time. The receiver can process it without fetching current state, subject to its own ordering and deduplication policy. `invoice.paid` with amount and currency is usually this shape.

**Thin notification:** The payload says that something changed and identifies a resource or revision for the receiver to fetch. The receiver deliberately acts on a current read, so it may observe later changes. This can be preferable for large resources, strict authorization at read time, or clients that only need the newest state.

Stripe documents both shapes: its older event APIs commonly include a versioned snapshot, while newer thin events carry a changed object's identifier for retrieval. Its event object reference also states that event `data` never changes after creation. [Stripe event retrieval](https://docs.stripe.com/api/events/retrieve) [Stripe Event object](https://docs.stripe.com/api/events/object)

Neither approach is universally better. A thin notification cannot prove that the receiver saw the state that existed at the occurrence; a snapshot can be larger, harder to redact, and stale by the time it arrives. The mistake is to call a body a snapshot while regenerating it after every failure. If a receiver must fetch current state, include a resource ID and, where useful, a revision or observed-at value. Do not bury that semantic shift inside a retry implementation.

### Corrections should be new facts, not edits to old ones

Sometimes the original event itself was wrong. That does not justify silently modifying the stored payload and calling the next delivery a retry.

Publish a correction, reversal, or superseding event with its own identity and a link to the event it changes:

```json
{
  "id": "evt_801",
  "type": "invoice.payment_reversed",
  "occurredAt": "2026-10-18T13:10:00Z",
  "data": {
    "invoiceId": "in_184",
    "reversesEventId": "evt_7f3",
    "reason": "support_void"
  }
}
```

That leaves receivers with an ordered explanation rather than an event whose meaning changes depending on which delivery attempt arrived. It also makes an operational replay distinguishable from a domain correction. EventBridge makes a related distinction in its delivery documentation: an accepted publish is not evidence of delivery, and its newer replay mechanism can mark replayed traffic separately. [EventBridge publishing](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-publish.html) [EventBridge retry behavior](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html)

## Steps / Code

Review a webhook producer with these questions:

1. Can the exact logical event body be read by event ID without querying current domain tables?
2. Does every attempt name both an event ID and a distinct attempt or transport ID?
3. Does the event carry its occurrence time separately from the attempt's send time?
4. Is the payload schema or event version available to a receiver that stores events for later processing?
5. Does a retry use the persisted event, including the same resource version, rather than a freshly rendered object?
6. If the product intends a thin notification, does the documentation explicitly say the receiver must retrieve current state?
7. Can a correction or reversal be represented as a new event instead of mutating the original?

Then test the awkward sequence: create an event, fail its first delivery, mutate the source resource, retry, and compare the two logical payloads. For a snapshot contract, they should match. For a thin contract, they should still name the same notification and the receiver's later read should be an intentional part of the test—not an accident of the sender's retry code.

## Trade-offs

Persisting event-time data costs storage and creates retention work. Snapshot events can expose fields that a receiver no longer needs, so their schema should be deliberately narrow and their retention and access policy should match the sensitivity of the data. For very large objects, an immutable versioned reference may be a better event payload than a full copy.

Exact byte replay can also be the wrong promise. Signed transport headers may need fresh timestamps; endpoint migrations may change the destination; a receiver may accept a different encoding. Preserve the event's meaning and identity, then make transport-level changes explicit in attempt metadata. Do not confuse a reasonable transport variation with permission to change what happened.

Finally, this rule does not solve out-of-order delivery or guarantee exactly-once processing. Receivers still need ordering rules where the domain requires them, deduplication by a stable event identity, and a way to reconcile missed events. The benefit is narrower and important: a retry remains evidence about one occurrence instead of becoming a second, undocumented read of mutable state.

## References

- CNCF CloudEvents, [Core specification](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md)
- GitHub Docs, [Best practices for using webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- Stripe API Reference, [Retrieve an event](https://docs.stripe.com/api/events/retrieve) and [The Event object](https://docs.stripe.com/api/events/object)
- Amazon EventBridge, [Publishing events](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-publish.html) and [retrying delivery](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html)
- This repository, [Retries Need an Identity Before They Need Backoff](https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/)

## Final Take

An event says something happened. A delivery attempt says the system tried to tell someone about it.

Keep those records separate. Then a retry can be boring: the same fact, delivered again. That is exactly what a receiver needs in order to deduplicate it, audit it, and make a correct decision after a failure.

## Changelog

- 2026-10-18: Initial publication.
