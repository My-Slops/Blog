---
title: "A Signed Webhook Is Not a Freshness Guarantee"
date: "2026-10-24"
updated: "2026-10-24"
created_at: "2026-10-24T10:00:00-04:00"
published_at: "2026-10-24T10:00:00-04:00"
scheduled_at: "2026-10-24T10:00:00-04:00"
slug: "a-signed-webhook-is-not-a-freshness-guarantee"
description: "A webhook signature can prove who signed a payload and whether its bytes changed. A consumer still needs separate rules for duplicates, ordering, replay, and whether an old event may change current state."
summary: "Verify webhook signatures first, but do not treat them as a clock. Preserve delivery identity, model the version or sequence that matters to the domain, and make replayed or stale events explicit before they affect current state."
tags: [event systems, security, reliability, API design]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/a-signed-webhook-is-not-a-freshness-guarantee/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

An HMAC-valid webhook says that someone with the shared secret signed these bytes. It does not say that the delivery is new, that it arrived in causal order, or that applying it would produce the right current state.

Those are separate contracts. A receiver needs an event or delivery identity for deduplication, a domain version or ordering rule where order matters, and an explicit replay policy. Otherwise a perfectly valid old delivery can move a local projection backward, re-run an effect, or be mistaken for live work.

## A valid signature can still describe yesterday

Suppose a deployment service sends two signed webhooks for the same environment:

```text
14:00  deployment.succeeded  revision=2f1c
14:04  deployment.succeeded  revision=9ad7
```

The receiver gets the second one first and records `9ad7` as production. The network then releases the first delivery. Its signature verifies: the producer really did sign that exact older payload. If the receiver treats verification as permission to update its projection, it now reports `2f1c` as production.

Nothing forged the request. Nothing modified it. The bug is that authenticity was asked to answer a freshness question.

This is common because webhook implementations often put all their attention on signature verification. That is the right first security check. GitHub's documentation says a webhook secret lets a receiver verify that a delivery came from GitHub and was not tampered with. It separately tells receivers to use the `X-GitHub-Delivery` value to protect against replay attacks, and notes that GitHub may deliver webhooks out of order. Those are different jobs. [GitHub's validation guidance](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) and [webhook troubleshooting guide](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks) make the separation unusually visible.

## Four properties, not one

Treat these questions independently when designing a consumer:

| Question | What answers it | What it does not answer |
| --- | --- | --- |
| Did the expected producer create these bytes? | Signature verification over the raw request body | Whether the message is new or relevant now |
| Have I already handled this delivery or event? | Durable deduplication by a stable identity | Whether a first-seen event is older than current state |
| Does this event belong after the state I have? | A domain sequence, revision, or explicit causal rule | Whether the producer was authentic |
| Is this a replay for recovery or backfill? | Delivery metadata and a consumer replay policy | Whether reprocessing is safe by default |

There is useful overlap, but it is not enough to collapse the columns. A signed payload can be a duplicate. A first-seen payload can be old. A delivery can be both a legitimate replay and the wrong input for a live side effect.

The same distinction matters for an attacker who can capture a legitimate request. A secret prevents them from changing the body; it does not make an old, still-valid body harmless if the receiver accepts it indefinitely. A timestamp plus a narrow acceptance window can reduce that exposure, but only when the producer signs the timestamp, clocks and tolerances are specified, and the receiver has a clear policy for delayed legitimate deliveries. It is not a substitute for durable idempotency or domain ordering.

## Delivery IDs are for duplicates, not state order

A delivery ID gives a consumer a practical deduplication key. Store it with the terminal result before acknowledging the transport, so a retry can return without doing the effect again:

```text
delivery_id=8f2a
  -> signature valid
  -> applied event evt_742 for deployment prod

delivery_id=8f2a (redelivery)
  -> already applied; acknowledge without repeating the effect
```

That prevents one form of replay. It cannot decide whether `evt_742` should supersede `evt_741`, because both IDs may be new to this receiver. It also cannot tell whether two distinct events report independent facts or competing snapshots of one object.

GitHub makes this especially easy to overlook: a redelivery keeps the same `X-GitHub-Delivery` header. That is useful for recognizing the same delivery again, but it is not a global sequence number for a repository or a resource. The producer needs to provide the ordering information the domain actually requires, or the consumer needs to obtain it from an authoritative read.

Use the identity at the correct layer:

- **Delivery identity** prevents processing the same transport delivery twice.
- **Event identity** lets consumers deduplicate one business occurrence across transports or retries.
- **Resource revision** decides whether an event may update a current-state projection for that resource.
- **Operation identity** lets a receiver reconcile an external effect whose response was lost.

The names are less important than keeping the layers separate. [A Webhook Retry Must Not Become a New Snapshot](https://my-slops.github.io/Blog/posts/2026/10/a-webhook-retry-must-not-become-a-new-snapshot/) covers the producer-side half: a retry should preserve one event's meaning. The receiver still has to decide how that event relates to the state it already holds.

## Put the version next to the state transition

For stateful webhook contracts, an opaque resource revision is often more useful than a delivery timestamp. A timestamp may be missing, have limited precision, or describe when the producer emitted an event rather than the version of the resource it represents.

For example, a producer could send:

```json
{
  "eventId": "evt_742",
  "type": "deployment.succeeded",
  "occurredAt": "2026-10-24T14:04:18Z",
  "data": {
    "environment": "production",
    "revision": 184,
    "commit": "9ad7"
  }
}
```

The receiver can then state a rule it can test: only replace the local production projection if `revision` is greater than the stored revision for that environment. A duplicate or an older state event becomes harmless even if it arrives late.

```ts
async function acceptDeployment(delivery: Delivery, event: DeploymentEvent) {
  verifySignature(delivery.rawBody, delivery.signature);

  await db.transaction(async (tx) => {
    if (await tx.deliveries.exists(delivery.id)) return;

    const current = await tx.environments.get(event.data.environment);
    if (!current || event.data.revision > current.deploymentRevision) {
      await tx.environments.upsert({
        name: event.data.environment,
        deploymentRevision: event.data.revision,
        commit: event.data.commit,
      });
    }

    await tx.deliveries.insert({ id: delivery.id, eventId: event.eventId });
  });
}
```

This is illustrative, not a universal ordering algorithm. A numeric revision only works if the producer promises that it is scoped to the object and advances in the way the consumer assumes. With a sequence that can have gaps, a receiver might record the new revision but fetch the authoritative object before it exposes it. With independent fields or concurrent writers, a last-seen revision may be too coarse and the product may need merge rules instead.

The important requirement is to describe the version relationship in the API contract. “We sign all webhook payloads” describes transport integrity. It does not say how a consumer can tell that `revision=184` should win over `revision=183`.

## Replays need a different posture from live traffic

Replays are valuable for repair, migrations, and a newly deployed consumer. They are also a reason not to let every valid event automatically trigger a current live action.

Amazon EventBridge marks replayed events with replay metadata and documents that replayed events are not necessarily delivered in their original order. Its newer replay delivery model similarly exposes whether a delivery is `LIVE` or `REPLAY`. That metadata gives consumers a chance to choose a different path: rebuild a projection, write audit history, or skip an irreversible notification. [EventBridge archives and replays](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-archive.html) and [replayed-event delivery metadata](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-replay.html) are examples of a useful contract shape.

Do not use replay merely as another reason to throw old events away. Some domains need every occurrence, including the old ones: an audit pipeline, a ledger projection, or a warehouse backfill may correctly reprocess history. The consumer's purpose decides the rule:

| Consumer purpose | Sensible response to an old or replayed event |
| --- | --- |
| Current-state cache | Apply only if its version supersedes local state, or rebuild from an authoritative snapshot |
| Append-only audit store | Retain it once by event identity, preserving occurrence and receipt times |
| External side effect | Require an operation identity and an explicit replay policy; do not infer safety from a valid signature |
| Analytics backfill | Process within a declared time range and label the run as historical |

This is also why arrival time is weak evidence of causal order. A delivery timestamp answers when the receiver saw the event, not when the source occurrence happened or which state revision it represents. [An Incident Timeline Needs Two Clocks](https://my-slops.github.io/Blog/posts/2026/07/an-incident-timeline-needs-two-clocks/) explains why those times should survive separately.

## Make the failure visible

For each webhook type that can change local state or trigger an effect, write down the answers before an outage writes them for you:

1. Which exact bytes are signed, and is verification performed before parsing or side effects?
2. What stable ID lets the consumer recognize a duplicate delivery or event, and how long is that record retained?
3. What version, sequence, or authoritative read determines whether an event is still applicable to current state?
4. Are gaps permitted? If so, does the consumer fetch, buffer, reconcile later, or intentionally accept a stale projection?
5. How is a recovery replay marked, and which consumers may re-run their effects during it?
6. What does the consumer record when it refuses an old-but-valid event? A dropped message without a reason is difficult to distinguish from a missing delivery later.

Test the uncomfortable order: apply revision 184, then send a valid, first-seen revision 183; replay the same delivery; and replay an older range while live events continue. The desired behavior should be explicit for each consumer, not an accident of whichever request arrived last.

## Trade-offs

Versions, deduplication records, and replay metadata add storage and API surface. Strict sequence handling can increase latency or cause a consumer to pause while it reconciles a gap. A timestamp window can reject legitimate delayed traffic when clocks or queues misbehave. For a low-consequence analytics event, that machinery may cost more than a slightly stale dashboard.

But do not hide the trade-off behind signature verification. If a stale state update could restore an access grant, point a deployment dashboard at an old revision, or repeat a financial effect, the receiver needs a freshness policy that fits that consequence.

## References

- GitHub Docs, [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- GitHub Docs, [Best practices for using webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- GitHub Docs, [Webhook deliveries can be out of order](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks#webhook-deliveries-are-out-of-order)
- Amazon EventBridge, [Archiving and replaying events](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-archive.html)
- Amazon EventBridge, [Telling replayed events apart](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-replay.html)
- This repository, [A Webhook Retry Must Not Become a New Snapshot](https://my-slops.github.io/Blog/posts/2026/10/a-webhook-retry-must-not-become-a-new-snapshot/)
- This repository, [An Incident Timeline Needs Two Clocks](https://my-slops.github.io/Blog/posts/2026/07/an-incident-timeline-needs-two-clocks/)

## Final Take

Verify the signature. Then ask the separate question that signatures cannot answer: *is this event still allowed to change my view of the world?*

That answer comes from a durable identity, a version or ordering contract, and a replay policy matched to the effect. A signed event is authentic evidence. It is not a clock.

## Changelog

- 2026-10-24: Initial publication.
