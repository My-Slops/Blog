---
title: "Agent Evals Need Tool States, Not Just Tool Outputs"
date: "2026-10-19"
updated: "2026-10-19"
slug: "agent-evals-need-tool-states-not-just-tool-outputs"
description: "An agent that passes when every tool returns a clean answer has only been tested in the state where it needs the least judgment. Evaluate denials, partial results, timeouts, and uncertain writes as first-class tool outcomes."
summary: "A tool result is more than data. It carries evidence about coverage, authority, and whether an external effect happened. Build agent eval cases around those states, then grade both the next action and the claim the agent makes to the user."
tags: [ai agents, evals, reliability, developer tooling, testing]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/agent-evals-need-tool-states-not-just-tool-outputs/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

Most agent evals make tools unrealistically helpful. Search returns complete results. A write either succeeds or throws before doing anything. Authorization is stable. Network failures are ordinary errors with no ambiguity behind them.

That tests whether a model can follow the happy path. It does not test the decisions that make an agent safe: whether it distinguishes no matches from incomplete coverage, stops after a policy denial, reconciles a timed-out write, or asks before widening its scope.

Treat a tool's operational state as part of the eval input. Then grade two things: the next action the agent chooses and the claim it makes about the result. A fluent answer after incomplete evidence is a failure even if its JSON is valid and its tool call looked reasonable.

## Context

Consider an agent asked to close every expired trial account in a workspace. A tidy eval fixture makes the job look simple:

```json
{
  "tool": "accounts.search",
  "result": {
    "accounts": ["acct_12", "acct_17"],
    "complete": true
  }
}
```

The agent identifies two accounts, asks for approval, calls `accounts.close`, and reports success. That is worth testing, but it is the least interesting version of the workflow.

The production cases that expose its contract look different:

| Tool state | What the agent must decide |
| --- | --- |
| Search returns an empty page from an index lagging by an hour | Can it say there are no expired accounts? |
| Search returns a cursor and a hard page limit | Should it keep reading, narrow the request, or explain the coverage boundary? |
| A close call is denied because its approval expired | Must it stop rather than retry with a changed target? |
| The remote service accepts a close call but the response times out | Can it safely retry, or must it look up the operation first? |
| One account closes and the next call is rate-limited | What state should it preserve before the run stops? |

The prompt can be identical in all five cases. The correct behavior is not.

OpenAI's current guidance frames agent evaluation around end-to-end traces, including model calls, tool calls, guardrails, and handoffs—not merely the final text. [Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals/) and [trace grading](https://developers.openai.com/api/docs/guides/trace-grading/) make that distinction explicit. The consequence for test design is practical: tool outcomes need enough structure for an eval to exercise a real workflow branch.

## Key Points

### A tool result has an evidence state, not only a payload

An array, a JSON object, or an HTTP status code is not a complete description of what an agent learned. A useful tool contract also reports the conditions under which its data or effect can be trusted.

For reads, those conditions often include coverage, freshness, scope, pagination, and authorization. For writes, they include whether the request was rejected before dispatch, accepted by the remote system, completed, or left in an unknown state after a lost response.

That is why the following two results cannot be graded the same way:

```json
{ "matches": [], "coverage": "complete", "asOf": "2026-10-19T14:00:00Z" }
```

```json
{ "matches": [], "coverage": "partial", "reason": "index_lag", "asOf": "2026-10-19T13:00:00Z" }
```

The first may support a bounded negative answer. The second supports a much narrower statement: this query found nothing in a known-incomplete view. [An Empty Search Result Is Not Evidence That Nothing Exists](https://my-slops.github.io/Blog/posts/2026/10/an-empty-search-result-is-not-evidence-that-nothing-exists/) explores that read-side distinction in detail.

The same separation matters for writes. A client-side timeout says the client did not receive a result. It does not establish that the server did not receive the request. Treating that state as a generic retry fixture teaches an agent to duplicate effects exactly when it should reconcile first. [A Tool Error Is an Instruction to Your Agent](https://my-slops.github.io/Blog/posts/2026/09/a-tool-error-is-an-instruction-to-your-agent/) and [What "Cancel" Means After an Agent Starts Work](https://my-slops.github.io/Blog/posts/2026/10/what-cancel-means-after-an-agent-starts-work/) cover the operational boundary; the eval should make the boundary observable.

### Model the state the runtime can actually expose

Do not create a fake universe where every failure is a string called `error`. The test double does not need to reproduce an entire vendor API, but it should preserve the decisions that matter to the agent.

```ts
type CloseAccountResult =
  | { state: "completed"; operationId: string; accountId: string }
  | { state: "denied"; code: "approval_expired" | "not_authorized" }
  | { state: "not_started"; code: "rate_limited"; retryAfterSeconds: number }
  | { state: "outcome_unknown"; operationId: string; reason: "response_timeout" };

type SearchAccountsResult = {
  state: "complete" | "partial" | "forbidden";
  accounts?: Array<{ id: string; expiresAt: string }>;
  nextPage?: string;
  asOf?: string;
  reason?: "index_lag" | "page_limit" | "policy_denied";
};
```

These names are illustrative. The important design choice is that a missing result, a denied request, and an uncertain external effect cannot collapse into one branch of a fixture. If the production tool cannot expose this information, that is a tool-contract problem before it is an eval problem.

For high-impact actions, OWASP recommends binding approval to the exact action and checking it at execution, as well as retaining observed approval, denial, timeout, and circuit-breaker behavior as validation evidence. [OWASP's AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html) is useful here because it treats those outcomes as control behavior, not decorative telemetry.

### Grade the recovery decision and the final claim separately

An agent can choose a sensible next tool call and still tell the user something false. It can also phrase a careful caveat while silently retrying a write that might already have succeeded. One final-answer score is too coarse for both errors.

For every non-happy-path case, define two expected assertions:

1. **Execution assertion:** Which actions are allowed, required, or forbidden next?
2. **Communication assertion:** What may the agent claim, and what uncertainty must it preserve?

For example, after `outcome_unknown`, a good execution assertion may require `operations.get(operationId)` and forbid another `accounts.close` call with a new idempotency key. The communication assertion may require: “The close request may have been accepted; I am checking its final status.” It must reject: “The account is still open” or “I closed the account” before evidence exists.

This is where trace-level grading earns its cost. A grader can inspect the tool sequence and the final user-visible response instead of rewarding an answer that merely contains the word “uncertain.” It also makes a regression diagnosable: did the planner choose a bad retry, did middleware hide a denial, or did the composer overstate a partial search?

### Use state transitions, not a collection of isolated error snapshots

The most valuable cases usually have a before and after. A static `429` fixture tests whether the agent recognizes rate limiting. A sequence tests whether it loses work:

```text
1. search returns five eligible accounts, complete as of 14:00
2. close acct_12 completes
3. close acct_17 returns rate_limited with retryAfterSeconds: 60
4. the run deadline has 20 seconds remaining
```

The correct result is not “retry later” in the abstract. It is to record that `acct_12` completed, refrain from starting work that cannot fit the deadline, and return a resumable outcome for `acct_17`. An eval that supplies only step 3 cannot tell whether the agent will falsely report the whole batch as failed or forget the completed effect.

Similarly, test a permission change between steps, not only a permission denial at the first call. A delegated grant may be valid while an agent plans a change and expire before it executes. A useful agent asks for a fresh decision; it does not reuse an old approval, broaden a target, or treat its earlier plan as durable authority. This is the evaluation version of [Delegation Should Shrink Authority](https://my-slops.github.io/Blog/posts/2026/10/delegation-should-shrink-authority/).

### Start with a small fault matrix tied to real risk

You do not need every HTTP code or provider quirk in a model-eval dataset. Begin with the state transitions that would cause the largest wrong effect or the most misleading user claim.

| Workflow boundary | First case to add | What success means |
| --- | --- | --- |
| Search or retrieval | empty result with partial coverage | Agent qualifies the answer or gathers more evidence. |
| Pagination or batching | scope changes before page two | Agent does not reuse continuation state as permission. |
| Approval | grant expires after preview | Agent asks for a fresh, parameter-bound decision. |
| External write | response lost after remote acceptance | Agent reconciles by operation identity before retrying. |
| Queue or rate limit | delay exceeds the task deadline | Agent stops, records progress, and returns a resumable state. |
| Cancellation | cancellation arrives after dispatch | Agent distinguishes stopping orchestration from reversing the effect. |

Each case should be reproducible. Version the tool policy, fixture state, model configuration, and expected assertions with the eval. When an incident uncovers a new state transition, add it before changing the prompt. OWASP similarly recommends regression cases for observed tool-abuse and approval failures, rather than treating a one-off fix as proof of safety. [OWASP's testing guidance](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html#9-secure-agent-testing--adversarial-validation)

## Steps / Code

Add the following review to an existing agent eval suite:

1. List every tool that can change scope, disclose data, enqueue work, or cause an external effect.
2. For each one, write its meaningful terminal and ambiguous states—not just its ideal response body.
3. Choose one transition that changes the correct next action: expired approval, partial index, rate limit, cursor mismatch, accepted-but-unconfirmed write, or cancellation after dispatch.
4. Encode the tool sequence in the fixture and assert the permitted and forbidden follow-up calls.
5. Grade the final response for both truthfulness and actionable next steps.
6. Preserve the trace when a case fails, so the team can see whether the fault was in model reasoning, orchestration, policy enforcement, or the tool contract.
7. Add production incidents as new state-transition cases, with sanitized fixtures and a clear expected result.

Avoid grading on one exact chain-of-thought-like transcript. An agent may reach a safe result through different valid read calls or wording. Grade the invariants instead: no unauthorized write, no duplicate uncertain write, no unqualified negative claim after incomplete search, and no success report without a durable result.

## Trade-offs

Stateful fixtures take more work than a static prompt-and-answer dataset. They need a small simulator or deterministic tool double, and over-specifying every intermediate call can make the suite brittle across harmless planner changes.

That is a reason to keep the matrix focused, not a reason to return to happy-path-only tests. Start where the system crosses an authority boundary, an external write boundary, or an evidence boundary. There, the agent's ability to recover honestly matters more than whether it chose the shortest path through a clean fixture.

There is also a boundary to preserve: an eval harness should not become the authorization system. Production middleware must still reject an expired approval or unsafe tool call. The eval's job is to prove that the agent reacts correctly when that enforcement does its job, and that its user-facing explanation matches the evidence it actually has.

## References

- OpenAI, [Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals/)
- OpenAI, [Trace grading](https://developers.openai.com/api/docs/guides/trace-grading/)
- OWASP, [AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- This repository, [An Empty Search Result Is Not Evidence That Nothing Exists](https://my-slops.github.io/Blog/posts/2026/10/an-empty-search-result-is-not-evidence-that-nothing-exists/)
- This repository, [What "Cancel" Means After an Agent Starts Work](https://my-slops.github.io/Blog/posts/2026/10/what-cancel-means-after-an-agent-starts-work/)
- This repository, [A Webhook Retry Must Not Become a New Snapshot](https://my-slops.github.io/Blog/posts/2026/10/a-webhook-retry-must-not-become-a-new-snapshot/)

## Final Take

An agent that performs well only when every dependency returns a clean answer is not ready for the environment that gives it authority.

Put the awkward tool states in the eval: partial evidence, revoked permission, a response that disappeared after dispatch, a deadline that makes the next retry pointless. Then test whether the agent preserves the boundary between what it knows, what it may do next, and what it can honestly tell the user.

## Changelog

- 2026-10-19: Initial publication on stateful tool outcomes in agent evaluations.
