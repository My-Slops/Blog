---
title: "Replaying a Dead-Letter Queue Is a New Production Change"
date: "2026-11-10"
updated: "2026-11-10"
slug: "replaying-a-dead-letter-queue-is-a-new-production-change"
description: "Moving messages out of a dead-letter queue starts a new delivery campaign. Review its destination, compatibility, rate, and effect semantics before treating it as recovery."
summary: "A dead-letter replay is not a harmless undo of past failures. Repair the cause, select a bounded set, verify that current consumers can interpret old work, and observe redelivery as a new production change."
tags: [reliability, distributed systems, operations, event systems, software architecture]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/11/replaying-a-dead-letter-queue-is-a-new-production-change/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

A dead-letter queue preserves work that the normal consumer could not finish. Moving that work back into a live queue does not restore the past. It starts a new delivery campaign against today's code, data, permissions, and downstream systems.

Treat replay like a small production change: identify the failure class, repair it, choose a bounded population, prove old messages remain interpretable, control the delivery rate, and watch the resulting effects. A button labelled “redrive” is not evidence that retrying every stored message is safe.

## The failure may be old; the effect will be new

Imagine an invoice consumer that dead-letters messages because its tax service is unavailable. Four hours later, the service recovers and an operator moves 80,000 messages back to the source queue.

Some of those invoices may now be cancelled. Some customers may have changed tax jurisdictions. A deployment may have changed the event schema or the meaning of a field. The original consumer might even have completed an external effect before it crashed and failed to acknowledge the message.

The queue cannot decide which of those facts matters. It knows only that a message was not successfully removed under an earlier set of conditions.

This is why a dead-letter queue is useful storage but not an operations plan. [Background Work Needs a Named Owner](https://my-slops.github.io/Blog/posts/2026/07/background-work-needs-a-named-owner/) makes the ownership point: an abandoned message needs someone who can inspect its history and choose a next action. Replay makes that choice consequential again.

Amazon SQS exposes the distinction plainly. Its redrive operation moves messages asynchronously, can target the original or a custom queue, and lets an operator limit the move rate. AWS recommends beginning with a low rate and increasing it while observing the destination; it also says an in-progress task can leave already-moved messages at the destination when cancelled. [Amazon SQS redrive documentation](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-dead-letter-queue-redrive.html) Those are deployment-shaped controls, not a guarantee that the original work is safe to repeat.

## Repair first; do not use replay as diagnosis

The tempting workflow is “the DLQ is nonempty, so redrive it.” That confuses a symptom with a failure class.

Before moving anything, establish at least one of these explanations:

| Failure class | A replay can be reasonable after | A replay is unsafe when |
| --- | --- | --- |
| Transient dependency failure | The dependency and its credentials are demonstrably healthy. | The same saturation, rate limit, or outage is still present. |
| Consumer defect | The deployed fix accepts the old payload and has been exercised on representative messages. | The fix only handles new producers or silently changes the business meaning. |
| Invalid or poisoned input | A repaired consumer can deliberately reject, transform, or route the bad record. | The message will fail identically and consume capacity again. |
| Unknown outcome after an external call | A durable idempotency or reconciliation path can determine the prior effect. | Replaying may charge, email, provision, or delete twice. |

This is not a demand for perfect certainty. It is a demand not to turn “we have not looked” into “please repeat all side effects.” When the reason is unknown, pull a representative sample with its receive history, consumer version, error class, and correlation identifiers. If no useful classification emerges, quarantine the population and investigate; a bulk replay only changes where the uncertainty is expressed.

The boundary is especially sharp for third-party effects. A consumer timeout says that the consumer did not receive a satisfactory response. It does not establish that the payment provider, email API, or deployment service did nothing. [What “Cancel” Means After an Agent Starts Work](https://my-slops.github.io/Blog/posts/2026/10/what-cancel-means-after-an-agent-starts-work/) explores the same gap for cancellation: local control flow cannot prove the remote outcome. A replay needs the same operation identity and reconciliation story as an ordinary retry.

## Old messages need a compatibility contract

A repair can make a consumer correct for messages produced today and still make it wrong for messages produced last week. The question is not merely whether JSON parses. It is whether the event still means what the current handler thinks it means.

Keep enough metadata with the message or its envelope to answer:

```ts
type ReplayCandidate = {
  messageId: string;
  eventType: "invoice.requested";
  schemaVersion: 3;
  occurredAt: string;
  failedAt: string;
  failureCode: string;
  effectKey: string;
  sourceConsumerVersion?: string;
};
```

`schemaVersion` is not just a decoder hint. It tells the replay tool which migrations and fixtures to exercise. `occurredAt` and `failedAt` distinguish the business time from the time the system became stuck. `effectKey` gives a receiver a chance to make an old delivery converge with a prior accepted effect rather than act twice.

Do not assume a FIFO label solves this. In SQS, a redrive task processes the dead-letter queue from its oldest received messages, but redriven messages can interleave with messages newly sent to the destination. It also assigns redriven messages a new message ID and enqueue time. [AWS’s SQS redrive behavior](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-dead-letter-queue-redrive.html) describes one implementation, but the larger lesson applies everywhere: queue order is delivery behavior, not a replacement for domain-level versioning and idempotency.

For a business process that truly requires ordering, choose a deliberate recovery plan. Pause new work for one partition, replay a bounded range through a compatibility consumer, then reopen admission. If availability matters more, allow interleaving but make the handler safe for stale and duplicate events. A replay tool cannot infer which trade-off the product intended.

## Make the replay observable and reversible in scope

Bulk redrive is often the wrong first move. The safer unit is a named replay run with a fixed selection and an explicit stop condition.

```text
replay_id=dlq-replay-2026-11-10-tax-outage
selection=failure_code=UPSTREAM_503 and failed_at between 09:00 and 10:30 UTC
destination=invoice-retry-canary
rate=5 messages/second
stop_if=duplicate_effects > 0 or error_rate > 1%
owner=payments-oncall
```

This is not bureaucracy for its own sake. It gives an incident reviewer a meaningful question to answer: did this particular recovery run make the intended population converge? It also lets an operator stop a small blast radius without treating the entire DLQ as one indivisible object.

Use a canary destination or consumer mode when the platform allows it. Validate parsing, deduplication, authorization, and downstream capacity with a sample first. Then increase the rate only while the signals support it. The important signals are not merely queue depth and successful receives. Count terminal business effects, duplicate suppressions, validation rejections, retry scheduling, and messages that return to the DLQ.

The receiver needs a stable effect identity because platform delivery identities may change. This follows the same principle as [A Lease Expiry Does Not Stop the Old Worker](https://my-slops.github.io/Blog/posts/2026/11/a-lease-expiry-does-not-stop-the-old-worker/): coordination metadata can recover ownership, but the resource being changed must still defend itself from a stale actor. A queue's new delivery attempt is not permission for the database or provider to accept a duplicate business operation.

## Keep the dead-letter record until recovery is proved

Do not erase the only evidence of why work failed just because a replay has started. Preserve, at least for the retention period that fits the system's data policy:

- the immutable replay selection or a defensible query that reconstructs it;
- the old payload's schema or representation identity, subject to appropriate secret handling;
- the triggering error and consumer version;
- the new run identity, destination, rate, and operator or automation authority; and
- per-message terminal outcomes, including “unknown” where a remote effect cannot yet be reconciled.

Retention itself can be a trap. For standard SQS queues, a message keeps its original enqueue timestamp when moved to a DLQ, and the age metric reflects when it entered the DLQ rather than when it was first sent. A DLQ with a shorter retention period can therefore lose the message earlier than an operator expects. [AWS’s DLQ retention guidance](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html) recommends making DLQ retention longer than the source queue's. The exact semantics are provider-specific, but the operational rule is general: know which clock drives expiry before relying on a backlog for later recovery.

There are cases where immediate replay is appropriate: a narrow, idempotent job failed during a verified five-minute provider outage; its payload format is stable; and a small canary produces no surprise effects. The point is not to make recovery ceremonious. It is to give it a success criterion stronger than “messages left the DLQ.”

## References

- AWS, [Configuring dead-letter queue redrive in Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-configure-dead-letter-queue-redrive.html)
- AWS, [Using dead-letter queues in Amazon SQS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- This repository, [Background Work Needs a Named Owner](https://my-slops.github.io/Blog/posts/2026/07/background-work-needs-a-named-owner/)
- This repository, [What “Cancel” Means After an Agent Starts Work](https://my-slops.github.io/Blog/posts/2026/10/what-cancel-means-after-an-agent-starts-work/)
- This repository, [A Lease Expiry Does Not Stop the Old Worker](https://my-slops.github.io/Blog/posts/2026/11/a-lease-expiry-does-not-stop-the-old-worker/)

## Final Take

Dead-lettering is evidence that a previous delivery campaign did not finish. Replaying is a decision to begin another one.

Make that decision with a repaired cause, a bounded population, compatibility checks, a controlled rate, and a receipt for the effects. Then a DLQ becomes a recovery tool rather than a place where unresolved work waits until someone presses the largest button available.

## Changelog

- 2026-11-10: Initial publication on treating DLQ replay as a scoped production change.
