---
title: "Retries Need an Identity Before They Need Backoff"
date: "2026-05-19"
updated: "2026-05-19"
created_at: "2026-05-19T10:00:00-04:00"
published_at: "2026-05-19T10:00:00-04:00"
scheduled_at: "2026-05-19T10:00:00-04:00"
slug: "retries-need-an-identity-before-they-need-backoff"
description: "Exponential backoff is useful only after a system can recognize whether a retried request is the same logical operation."
summary: "Before tuning retry delays, give each side effect a stable identity. Otherwise a network timeout can become a duplicate charge, email, or deployment."
tags: [distributed systems, APIs, reliability]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/retries-need-an-identity-before-they-need-backoff/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

A timeout does not say that an operation failed. It says the caller stopped hearing about it.

That difference is why retry policy begins with identity, not with exponential backoff. A client that sends `POST /invoices` twice after a timeout has two requests. Whether it has one invoice or two depends on a fact the server cannot infer from timing alone: are these attempts meant to be the same business operation?

## Make the operation nameable

Give the caller an idempotency key that represents the intended effect, not the HTTP connection. Store that key with the result under an atomic uniqueness constraint. A repeat with the same key returns the original result; a different payload under the same key is an error worth surfacing.

```sql
create table payment_requests (
  idempotency_key text primary key,
  request_hash text not null,
  payment_id uuid not null
);
```

The useful invariant is plain: one key, one effect. It applies equally to a charge, a provisioning request, a webhook consumer, or a deployment trigger.

Backoff still matters. RFC 9110 describes when retries are appropriate and warns that non-idempotent requests need special care. But delay does not manufacture safety. It merely spaces out duplicate attempts. A long retry interval can make an accidental duplicate less likely; it cannot make it impossible.

## Treat payload drift as evidence, not a convenience

The common weak implementation accepts a key, sees it again, and blindly returns success. That can hide a client bug:

```text
key=order-8472
attempt 1: { plan: "team", seats: 4 }
attempt 2: { plan: "team", seats: 40 }
```

These are not safely interchangeable. Persist a canonical request hash beside the key and reject a mismatch. The caller now has a concrete signal that it reused an identifier incorrectly instead of silently attaching the wrong meaning to a previous effect.

The same rule exposes an uncomfortable boundary: some effects cannot be made fully idempotent by an application database alone. If a request crosses into a payment network, email provider, or cloud control plane, propagate the stable identity where that provider supports it and record the handoff. Otherwise the recovery process still has an ambiguous window.

## What to change

For every retried command, answer three questions before selecting retry counts:

1. What is the logical operation called?
2. Where is the first successful effect recorded atomically with that identity?
3. What should a repeat with changed input do?

If those answers are missing, instrumenting more backoff curves is premature. The system is optimizing uncertainty rather than resolving it.

## References

- [RFC 9110: HTTP Semantics, section 9.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2) (2022) defines idempotent request methods and retry considerations.
- [Stripe API: Idempotent requests](https://docs.stripe.com/api/idempotent_requests) documents the practical pattern of replaying a prior result for the same key.

## Final take

Retries are not a reliability feature until repeats have a shared identity. Backoff is traffic management; idempotency is correctness.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-05-19 scheduled slot; original draft did not survive, so this was replayed after archive and source review.
