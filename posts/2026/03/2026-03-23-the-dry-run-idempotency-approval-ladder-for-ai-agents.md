---
title: "The Dry-Run + Idempotency Approval Ladder for AI Agents"
date: "2026-03-23"
updated: "2026-03-23"
slug: "the-dry-run-idempotency-approval-ladder-for-ai-agents"
description: "A practical control pattern for tool-using agents: simulate first, make writes safely retryable, and gate irreversible actions with explicit approval."
canonical_url: "https://my-slops.github.io/Blog/posts/2026/03/2026-03-23-the-dry-run-idempotency-approval-ladder-for-ai-agents/"
summary: "Most AI-agent failures are not reasoning failures; they are execution failures. A simple ladder—dry-run, idempotent write, then human approval for irreversible actions—reduces costly side effects while preserving speed."
tags:
  - ai agents
  - reliability
  - safety
  - engineering
  - workflow
author: "vabs"
status: "published"
---

## TL;DR

If your agent can take actions, use a three-step execution ladder:
1. **Dry-run** first (show intended change without applying it).
2. **Idempotent write** next (safe retry without duplicate side effects).
3. **Approval gate** for irreversible or external actions.

This pattern borrows from mature infrastructure/payment systems and gives agent workflows a much lower failure blast radius.

## Context

Many teams add approval prompts to agent workflows but skip two earlier controls: simulation and safe retries.

That creates a fragile system:
- “Looks right” plans can still fail at apply time.
- Network retries can duplicate side effects.
- Humans are forced to review too many low-value decisions.

Established platforms already solved analogous problems:
- Kubernetes supports dry-run modes (`client`/`server`) to preview applies.
- AWS APIs expose idempotency tokens to make retries safer.
- Stripe documents idempotency keys for POST operations.
- NIST AI RMF frames AI safety as an operational risk-management problem, not just a model-quality problem.

The useful synthesis for agent design is a **control ladder** rather than a single “human in the loop” checkbox.

## Key Points

### 1) Dry-run should be the default planning surface

Before any side effect, require the agent to produce a structured action preview:
- target resource,
- intended change,
- expected downstream effect,
- confidence/uncertainty notes.

If no meaningful dry-run representation exists, treat the action as higher risk by default.

### 2) Idempotency converts retries from dangerous to routine

Agents operate in noisy environments (timeouts, flaky APIs, retries). Without idempotency, retries can create duplicate charges, duplicate tickets, or repeated mutations.

Use a request identity key per logical action and persist it with result metadata. On retry, the system should return the original outcome when parameters match.

### 3) Approval should be reserved for irreversible/external impact

Human review is expensive. Use it where it matters most:
- destructive mutations (delete/overwrite/force operations),
- external communications (email/message/payment),
- high-privilege actions (production, secrets, policy changes).

This keeps reviewers focused on true risk, not noise.

### 4) The ladder improves both safety and throughput

Counterintuitively, adding control points can speed teams up:
- fewer rollback incidents,
- fewer duplicate side effects from retries,
- clearer operator trust in autonomous steps,
- less blanket “manual mode” fallback.

### 5) Log each rung as a first-class event

For every action attempt, record:
- dry-run artifact hash/reference,
- idempotency key,
- approval decision (if required),
- final execution result.

This creates a usable audit trail and shortens incident response.

## Steps / Code

### 10-minute implementation pass

```text
Minute 0-2: Classify actions as read-only, reversible write, irreversible/external
Minute 2-4: Add dry-run output schema for every write-capable action
Minute 4-6: Add idempotency keys to non-idempotent POST/mutation calls
Minute 6-8: Add approval gate for irreversible/external classes
Minute 8-10: Emit structured execution logs for each ladder rung
```

### Minimal ladder policy sketch

```json
{
  "default": "deny",
  "ladder": ["dry_run", "idempotent_execute", "approval_if_high_impact"],
  "high_impact": ["delete", "force", "external_send", "payment", "prod_change"],
  "require": {
    "dry_run": ["target", "change", "expected_effect"],
    "idempotent_execute": ["request_key", "params_hash"]
  }
}
```

### Execution rule

```text
If dry-run is missing OR idempotency cannot be guaranteed for a risky write,
block execution and request human confirmation.
```

## Trade-offs

### Costs

1. Extra implementation effort for dry-run artifacts and key management.
2. More policy plumbing across tool wrappers.
3. Initial friction while teams classify action risk correctly.

### Benefits

1. Lower blast radius from bad plans and flaky retries.
2. Fewer duplicate side effects in real systems.
3. More targeted human oversight where reversibility is low.
4. Better auditability and post-incident debugging.

## References

- Kubernetes docs, `kubectl apply` (`--dry-run` client/server): https://kubernetes.io/docs/reference/kubectl/generated/kubectl_apply/
- AWS EC2 API (`RunInstances`, `ClientToken` idempotency): https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_RunInstances.html
- Stripe API docs, idempotent requests: https://docs.stripe.com/api/idempotent_requests
- NIST, AI Risk Management Framework overview: https://www.nist.gov/itl/ai-risk-management-framework

## Final Take

“Human in the loop” is too coarse by itself.

A better default for agent actions is: **simulate first, execute safely, escalate only when impact is hard to reverse**. If you implement just one reliability upgrade this week, make it this ladder.

## Changelog

- 2026-03-23: Initial publish with dry-run + idempotency + approval ladder pattern for tool-using agents.
