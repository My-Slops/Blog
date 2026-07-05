---
title: "An Incident Timeline Needs Two Clocks"
date: "2026-07-05"
updated: "2026-07-05"
created_at: "2026-07-05T10:00:00-04:00"
published_at: "2026-07-05T10:00:00-04:00"
scheduled_at: "2026-07-05T10:00:00-04:00"
slug: "an-incident-timeline-needs-two-clocks"
description: "Event time and observation time answer different questions; incident reviews that collapse them produce persuasive but false sequences."
summary: "Record when an event occurred and when your system learned about it. Delayed delivery, clock skew, and retries make the distinction operationally necessary."
tags: [observability, distributed systems, incident response]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/an-incident-timeline-needs-two-clocks/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

At 10:03 a payment provider emits a failure event. At 10:11 your webhook worker receives it after a network partition. At 10:14 an alert fires. Which time belongs in the incident timeline?

All three, if they answer different questions.

Most event pipelines preserve one timestamp and call it “the time.” That makes postmortems look orderly until a retry, queue delay, or a machine with a bad clock reverses cause and effect. An event timestamp says when the producer claims something happened. An observation timestamp says when this system first received or recorded it. Alert and action timestamps tell yet other parts of the story.

```json
{
  "provider_event_at": "2026-07-05T10:03:12Z",
  "received_at": "2026-07-05T10:11:47Z",
  "persisted_at": "2026-07-05T10:11:48Z"
}
```

## Do not overwrite provenance

The cheap model replaces `provider_event_at` with `received_at` during ingestion. It makes sorting easy, but destroys the evidence needed to distinguish a late event from a late processor. Keep both. When the producer time is untrusted or absent, label that fact rather than inventing precision.

The same applies to logs. A service's timestamp is useful for local sequencing, but a collector timestamp is often the better basis for deciding whether the telemetry pipeline was delayed. Clock synchronization reduces error; it does not eliminate the conceptual difference.

OpenTelemetry makes this explicit by allowing a span's start and end time to be supplied separately from export timing. That separation is a design clue: telemetry is an observation of work, not the work itself.

## Practical review question

When an incident report says “X happened before Y,” ask which clock establishes that ordering. If the answer is merely the order in which a dashboard displayed rows, the conclusion may be a queue artifact.

## References

- [OpenTelemetry trace API specification](https://opentelemetry.io/docs/specs/otel/trace/api/) documents explicit span timestamps.
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) defines an interoperable timestamp format; it does not make independently observed times identical.

## Final take

One clock tells you when something claims to have occurred. The other tells you when you became responsible for it. Incident analysis needs both.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-07-05 scheduled slot; topic is distinct from the archive’s Git/publishing lineage articles.
