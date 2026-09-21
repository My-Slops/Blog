---
title: "A Tool Error Is an Instruction to Your Agent"
date: "2026-09-21"
updated: "2026-09-21"
slug: "a-tool-error-is-an-instruction-to-your-agent"
description: "When an agent receives a tool failure, it must decide whether to repair, wait, ask, stop, or reconcile an uncertain write. A generic error string turns that decision into guesswork."
summary: "Tool errors are part of an agent's control loop. Return a bounded, typed recovery signal so the agent can distinguish a repairable request from a policy denial, a rate limit, and an action whose completion is unknown."
tags:
  - ai agents
  - api design
  - reliability
  - developer tooling
  - security
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/09/a-tool-error-is-an-instruction-to-your-agent/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

An agent does not experience a tool error as a red line in a terminal. It receives the error as context for its next decision.

If a mail tool returns `500: failed`, a model has to guess: should it correct its arguments, retry, tell the user, switch tools, or assume the message might already have been sent? That guess is often more dangerous than the original failure.

Design tool failures as bounded recovery instructions. An error should tell the orchestrator and, where appropriate, the model whether the request can be repaired, must wait, needs user action, is forbidden, or has an unknown side-effect outcome. Do not make the model infer operational policy from a human-oriented exception string.

## Context

Consider an agent that creates a support ticket. It sends a valid-looking request and its connection closes before the response arrives. The tool wrapper returns `request failed`.

There are two very different realities behind that sentence:

- The service rejected the request before creating anything. Correcting a required field and trying again may be fine.
- The service created ticket `SUP-1842`, then the response was lost. Retrying may create a duplicate ticket.

The exception text does not carry enough information to decide between them. Neither does an HTTP status code by itself. A 400 might identify a repairable field; a 403 should normally end the autonomous path; a 503 might allow a delayed retry; a timeout after a write leaves completion uncertain.

For conventional client software, a developer may inspect logs and add a branch later. For an agent, the next consumer is often the model inside the same execution loop. The error payload is therefore an interface: it shapes what the system does next.

## Key Points

### A failure class is more useful than a stack trace

The useful question after a failed tool call is not merely “what went wrong?” It is “what response is allowed to this failure?”

An agent tool can usually express that answer with a small set of categories:

| Failure class | Next action | Example |
| --- | --- | --- |
| `invalid_request` | Repair only the named input, then retry if the deadline permits. | `start_date` is later than `end_date`. |
| `authorization_required` | Ask the user or obtain an approved credential; do not improvise access. | Calendar connection has expired. |
| `policy_denied` | Stop this path and explain the boundary. | The agent may not email an external address. |
| `rate_limited` | Wait for the supplied delay, subject to the overall deadline. | Search API permits another request in 20 seconds. |
| `unavailable` | Retry only when the operation is safe and time remains; otherwise use a declared fallback or stop. | Document index is temporarily unavailable. |
| `outcome_unknown` | Reconcile by idempotency key or lookup before any retry. | Ticket creation timed out after the request was accepted. |

Those are recommendations, not a universal taxonomy. A read-only search tool can reasonably label a timeout `unavailable`; a payment or message-sending tool should be much more cautious. The category has to reflect the operation's side effects, not just the transport error.

The [Tool-Scope Contract](https://my-slops.github.io/Blog/posts/2026/03/2026-03-20-the-tool-scope-contract-for-llm-agents/) describes what an agent is allowed to call. A recovery signal describes what it is allowed to do *after the call fails*. Both are policy surfaces.

### Separate model-visible guidance from operator diagnostics

A raw exception is rarely safe or helpful context. It might include an upstream URL, internal query, account identifier, stack trace, or a retry hint that is valid for a human operator but wrong for an autonomous loop.

Return two deliberately different artifacts:

1. A **bounded recovery result** for the agent runtime: stable class, safe-to-display detail, retry information, and any field names it may repair.
2. A **diagnostic event** for operators: trace ID, normalized cause, dependency details, and protected debugging context.

The second belongs in logs and traces. The first belongs in the agent's control flow. This keeps the model from treating a database error as an instruction while preserving enough evidence to debug the incident. It also complements [agent traces](https://my-slops.github.io/Blog/posts/2026/08/agent-tool-calls-need-traces-not-just-logs/): a trace explains the failed execution path; the recovery result tells the current path what to do next.

### Make the recovery decision executable before the model sees it

Do not ask a model to enforce retry policy from prose such as “try again later if appropriate.” The orchestrator already knows the action type, remaining deadline, attempt count, and whether an idempotency key exists. It should enforce the non-negotiable parts in code.

For example:

```ts
type ToolFailure = {
  kind:
    | "invalid_request"
    | "authorization_required"
    | "policy_denied"
    | "rate_limited"
    | "unavailable"
    | "outcome_unknown";
  safeDetail: string;
  retryAfterMs?: number;
  repairableFields?: string[];
  reconciliation?: {
    idempotencyKey: string;
    lookupTool: "tickets.find_by_idempotency_key";
  };
  traceId: string;
};

function nextStep(failure: ToolFailure, remainingMs: number) {
  if (failure.kind === "policy_denied") return "stop";
  if (failure.kind === "authorization_required") return "request_user_action";
  if (failure.kind === "outcome_unknown") return "reconcile";
  if (failure.kind === "invalid_request") return "repair_input";
  if (
    failure.kind === "rate_limited" &&
    failure.retryAfterMs !== undefined &&
    failure.retryAfterMs < remainingMs
  ) {
    return "retry_after_delay";
  }
  return "stop_or_declared_fallback";
}
```

This is illustrative, not a complete retry system. In particular, `retry_after_delay` still needs a maximum-attempt rule and a deadline check. The point is the division of labor: code owns safety invariants; the model may help with an allowed repair or choose between already-approved fallbacks.

This matters for [`outcome_unknown`]. A timeout after an external write is not evidence that nothing happened. Use an idempotency key or a reconciliation lookup before retrying, as described in [Idempotency Keys Are the Seatbelt for AI Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-27-idempotency-keys-are-the-seatbelt-for-ai-agents/). Giving a model permission to “try once more” is not an adequate substitute.

### Use standards as a boundary, not as the whole design

[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html) defines HTTP problem details for machine-readable error content. Its `type` member identifies the problem, and the format permits problem-specific extension members. That makes it a good transport-level envelope for a tool service.

But the RFC does not know whether your agent can safely retry a write, ask a user for consent, or use a fallback provider. Those are application semantics. A practical service might map its HTTP problem into a tool-specific recovery result:

```json
{
  "type": "https://api.example.com/problems/ticket-outcome-unknown",
  "title": "Ticket outcome could not be confirmed",
  "status": 504,
  "kind": "outcome_unknown",
  "safeDetail": "The ticket service did not confirm whether it created the ticket.",
  "reconciliation": {
    "idempotencyKey": "task_7e9f",
    "lookupTool": "tickets.find_by_idempotency_key"
  }
}
```

The `type` remains useful for generic clients and documented API semantics. `kind` gives the orchestration layer a compact policy vocabulary. Do not put credentials, raw request bodies, internal hostnames, or stack traces in either field. RFC 9457 explicitly warns that problem details are an HTTP-interface description, not a debugging channel.

For temporary service unavailability, HTTP's [`Retry-After`](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3) header can communicate a delay in seconds or as a date. Honor it only inside the task's remaining budget. A downstream server's suggested wait must not silently overrule the user's deadline; [deadline budgets](https://my-slops.github.io/Blog/posts/2026/03/2026-03-30-deadline-budgets-are-the-missing-guardrail-for-ai-agents/) still decide whether waiting is useful.

### Test failures as paths through the agent, not just API responses

Tool tests often stop at “the service returned 429” or “the wrapper threw.” Add the next decision to each test case:

```text
Given: a read-only search returns rate_limited with retryAfterMs=15_000
And: 25_000 ms remains in the task deadline
Expect: one delayed retry is eligible

Given: a ticket write times out with an idempotency key
Expect: the runtime calls the reconciliation lookup before any retry

Given: an external-email policy is denied
Expect: no retry, no alternative send tool, and a user-visible boundary explanation
```

These cases make a subtle defect visible: an agent can be excellent at selecting tools and still be unsafe at responding to their failures. Track the resulting classes by tool and version, but keep their details out of high-cardinality metrics. The goal is to find a broken recovery contract, not to recreate the full request in a dashboard.

## Steps / Code

### A small design checklist for every tool

Before exposing a tool to an agent, define its failure behavior alongside its argument schema:

1. List the tool's read and write operations separately.
2. For each failure, state whether the runtime may repair, wait, retry, ask, stop, or reconcile.
3. Require an idempotency key and lookup route for writes that can become uncertain.
4. Keep the model-visible message factual, bounded, and free of sensitive implementation detail.
5. Enforce deadlines, retry caps, authorization, and policy denial in the orchestrator.
6. Add one test for each allowed recovery path and one for every forbidden retry.

The list should be short enough to review when a tool changes. If it becomes a long catalogue of English exceptions, the recovery contract is probably too vague for code to enforce.

## Trade-offs

Typed recovery results add API design work, and not every internal script needs a six-way taxonomy. A single read-only tool with no retries may only need `invalid_request` and `unavailable`.

There is also a real risk of overexposing operational detail. A message that helps a model correct a date field is useful; a message that names the database replica, authorization policy internals, or another customer's resource is not. Keep the structured result narrow and maintain a separate access-controlled diagnostic path.

Finally, categories do not make an unreliable dependency reliable. A bad classification can be worse than an omitted one: marking an unknown payment result as retryable invites duplication. Start with conservative `stop` or `reconcile` behavior for side effects, then relax it only when the downstream contract proves the operation is safe.

## References

- IETF, [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- IETF, [RFC 9110: HTTP Semantics — Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3)
- This repository, [The Tool-Scope Contract for LLM Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-20-the-tool-scope-contract-for-llm-agents/)
- This repository, [Idempotency Keys Are the Seatbelt for AI Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-27-idempotency-keys-are-the-seatbelt-for-ai-agents/)
- This repository, [Deadline Budgets Are the Missing Guardrail for AI Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-30-deadline-budgets-are-the-missing-guardrail-for-ai-agents/)
- This repository, [Agent Tool Calls Need Traces, Not Just Logs](https://my-slops.github.io/Blog/posts/2026/08/agent-tool-calls-need-traces-not-just-logs/)

## Final Take

An agent does not just need to know that a tool failed. It needs a safe next move.

Make that move explicit. Return a compact recovery class, let code enforce the hard boundaries, reconcile uncertain writes before retrying, and reserve detailed diagnostics for operators. Then a failure stops being an invitation for the model to guess and becomes part of a control loop you can review.

## Changelog

- 2026-09-21: Initial publish.
