---
title: "A Log Line Cannot Prove a Message Was Processed"
date: "2026-09-13"
updated: "2026-09-13"
created_at: "2026-09-13T10:00:00-04:00"
published_at: "2026-09-13T10:00:00-04:00"
scheduled_at: "2026-09-13T10:00:00-04:00"
slug: "a-log-line-cannot-prove-a-message-was-processed"
description: "A consumer can log that it handled a message and still fail before the state change or acknowledgement that makes handling real."
summary: "Define processing by its durable effect and acknowledgement boundary, not by an optimistic log line emitted at the start of a handler."
tags: [event systems, observability, reliability]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/09/a-log-line-cannot-prove-a-message-was-processed/"
license: "MIT"
audience: "general"
reading_time: "4 min"
---

`processed message order-184` is one of the easiest lies a log can tell.

The handler may have emitted it before validating the payload. It may crash after writing one of two necessary records. It may commit the offset before committing the database transaction. The message was observed; it was not necessarily processed in the sense the business cares about.

## Put the claim after the effect

First define the effect: “the invoice record exists and the email command is durably queued,” for example. Then make the log and metric refer to that terminal condition, with a message ID and result status.

```text
message_id=… outcome=applied invoice_id=… outbox_id=…
```

This does not make distributed transactions magically free. It makes the remaining gap visible. If the database effect and broker acknowledgement cannot share one transaction, use an outbox or another recovery mechanism that lets a retry determine whether the effect already exists.

Consumer offsets are progress markers, not proof that downstream business state is complete. Kafka's documentation is explicit that committing an offset controls where a consumer resumes. That is useful operational state, but it should not be mistaken for an end-to-end receipt.

## What to measure

Count received, rejected, applied, retried, and dead-lettered messages separately. A single “processed” counter conceals the distinction that matters during an incident: whether work is arriving, whether it is valid, and whether it changes the intended system of record.

## References

- [Apache Kafka consumer documentation](https://kafka.apache.org/documentation/#consumerconfigs_enable.auto.commit) describes offset commits and consumer progress.
- [Microservices.io: Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) explains a common way to coordinate a database effect with message publication.

## Final take

Logs describe what code attempted. A durable effect and an acknowledgement boundary describe what the system can honestly claim.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-09-13 scheduled slot with a topic distinct from the archive’s tracing article.
