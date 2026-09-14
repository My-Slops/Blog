---
title: "Retry Queues Need Deadlines, Not Just Attempt Counts"
date: "2026-09-14"
updated: "2026-09-14"
created_at: "2026-09-14T10:00:00-04:00"
published_at: "2026-09-14T10:00:00-04:00"
scheduled_at: "2026-09-14T10:00:00-04:00"
slug: "retry-queues-need-deadlines-not-just-attempt-counts"
description: "A retry budget expressed only as attempts ignores whether an operation remains useful when the next attempt finally runs."
summary: "Attach an expiry to retryable work. The deadline protects systems from turning a temporary dependency failure into stale, surprising side effects."
tags: [reliability, queues, distributed systems]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/09/retry-queues-need-deadlines-not-just-attempt-counts/"
license: "MIT"
audience: "general"
reading_time: "4 min"
---

“Retry five times” is a policy without a clock. Five fast failures might finish in seconds; five exponential retries might run tomorrow, after the user has cancelled the order or the deploy has been superseded.

An attempt count controls how much pressure a job can create. A deadline controls whether the job is still worth doing.

```json
{
  "job_id": "email-…",
  "created_at": "2026-09-14T10:00:00Z",
  "expires_at": "2026-09-14T10:30:00Z",
  "attempt": 3
}
```

Before each retry, compare the next eligible time with `expires_at`. If it has passed, record an explicit expired outcome and notify the appropriate owner. Do not quietly discard it, and do not keep retrying merely because the counter has room left.

## Freshness is part of correctness

Some jobs can run late safely: a nonurgent search-index update may be catch-up work. Others cannot: a one-time login link, inventory reservation, or fraud decision has a clear usefulness window. Treat that difference as a product policy supplied at enqueue time, not a scheduler default guessed by the queue.

Deadlines also make incidents calmer. During an outage, operators can identify which backlog is still actionable and which should be expired or recomputed. Without that distinction, recovery often replays days of side effects in the original order and calls it reliability.

## References

- [Google SRE Book: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/) explains bounded retries and the harm from uncontrolled retry behavior.
- [RFC 9110, section 10.2.3](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3) defines `Retry-After`, an example of time-aware retry guidance.

## Final take

An operation that is no longer useful should not become more likely merely because it has been failing for longer.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-09-14 scheduled slot following archive and source review.
