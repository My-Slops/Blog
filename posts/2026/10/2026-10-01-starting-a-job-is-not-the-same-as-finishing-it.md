---
title: "Starting a Job Is Not the Same as Finishing It"
date: "2026-10-01"
updated: "2026-10-01"
created_at: "2026-10-01T10:00:00-04:00"
published_at: "2026-10-01T10:00:00-04:00"
scheduled_at: "2026-10-01T10:00:00-04:00"
slug: "starting-a-job-is-not-the-same-as-finishing-it"
description: "An API that accepts or enqueues work has not necessarily completed it. Return a durable operation identity and explicit terminal outcome before an agent reports success."
summary: "A successful call can mean that work was accepted, not that its external effect happened. Model long-running work as an operation with a durable status and make agents distinguish started from completed."
tags:
  - ai agents
  - api design
  - reliability
  - distributed systems
  - developer tooling
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/starting-a-job-is-not-the-same-as-finishing-it/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

“Import started” and “import completed” are different facts. Treating them as one success state makes an agent sound finished while a queue may still reject, retry, or fail the work later.

When an API accepts work that continues elsewhere, return a durable operation identity and an explicit outcome state. An agent may report that work was accepted; it should report completion only after it observes a terminal result or receives a trustworthy completion event.

## Context

An agent uploads a CSV and calls `imports.create`. The tool returns quickly:

```json
{
  "ok": true,
  "message": "Import started"
}
```

The agent tells the user, “Your customers have been imported.” Twenty minutes later, the worker discovers an invalid header after processing only the first chunk. The user has already started using an incomplete list.

Nothing in this scenario requires an unreliable model. The agent was given a success-shaped response that collapsed two separate events:

1. the service accepted a request to do work; and
2. the requested work reached a useful terminal outcome.

HTTP makes the distinction explicit. [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.3) defines `202 Accepted` as a request accepted for processing that has not yet been completed, and notes that the response ought to point to a status monitor. But the same mistake appears behind `200 OK`, queue acknowledgements, workflow SDKs, and “started” fields. The status code is only part of the contract. The important question is what the caller is permitted to conclude.

## Key Points

### Acceptance is a useful result, not a completed result

An accepted request can be valuable. It may mean an export has a place in the queue, a deployment controller has recorded the desired version, or a background worker owns a document-processing job. The caller can use that fact to avoid submitting the same intent again.

It does not establish that the business effect exists. Between acceptance and completion, a job can be delayed, superseded, rejected by a downstream dependency, partially applied, cancelled, or retried. A webhook can be lost. A worker can finish after the caller's deadline. A child task can succeed while the aggregate task fails its policy check.

Those are not reasons to make every API synchronous. They are reasons to name the intermediate state honestly. “Accepted,” “queued,” and “running” should be first-class states rather than vague variations of success.

### Return an operation, not just a reassuring message

For work that outlives the request, the response should create or identify an operation that can be inspected later. Its API need not expose internal queue topology, but it should provide enough stable information for a caller to tell what happened.

```ts
type Operation = {
  id: string;
  kind: "customer_import" | "report_export";
  state: "accepted" | "running" | "succeeded" | "failed" | "cancelled";
  acceptedAt: string;
  completedAt?: string;
  result?: {
    importedCount?: number;
    downloadUrl?: string;
  };
  failure?: {
    code: "invalid_file" | "dependency_unavailable" | "policy_rejected";
    safeDetail: string;
  };
};

// `202 Accepted`
{
  "operation": {
    "id": "imp_7d3b",
    "kind": "customer_import",
    "state": "accepted",
    "acceptedAt": "2026-10-01T14:00:00Z"
  },
  "statusUrl": "/operations/imp_7d3b"
}
```

The TypeScript and JSON are illustrative, not a universal schema. The important property is durable identity. A human, an agent, a webhook receiver, and an operator dashboard can all refer to the same operation instead of trying to infer completion from a log line or a task transcript.

Terminal states should be boring and unambiguous. `succeeded` means the declared outcome occurred. `failed` means it did not, with a safe reason. `cancelled` means the system stopped it according to a documented policy. Do not overload `done` to mean “the HTTP request ended,” “the worker stopped,” or “a downstream service acknowledged receipt.”

### An agent needs two different user-facing verbs

The wording an agent uses should follow the operation state:

| Operation state | What the agent may say |
| --- | --- |
| `accepted` | “I started the import. I’ll confirm when it finishes.” |
| `running` | “The import is still processing; 3 of 12 files have completed.” |
| `succeeded` | “The import completed: 842 customers were added.” |
| `failed` | “The import did not complete because the `email_address` column is missing.” |
| `cancelled` | “The import was cancelled before completion; no final import result is available.” |

This is more than careful copy. It changes what a user is entitled to rely on. “Started” tells them an operation exists. “Completed” tells them an outcome was observed. If a product cannot observe completion, it should say so instead of making the agent invent certainty.

The same discipline complements [A Tool Error Is an Instruction to Your Agent](https://my-slops.github.io/Blog/posts/2026/09/2026-09-21-a-tool-error-is-an-instruction-to-your-agent/). That article concerns a tool call whose result is a failure path. Long-running work has another boundary: a successful start whose final outcome is still unknown.

### Keep the operation tied to the original intent

An operation ID is also the anchor for retry and reconciliation. If a client times out after sending a request, it needs to know whether to find the existing operation, retry the intent, or ask the user. Creating a fresh job on every retry can duplicate exports, messages, charges, and imports.

Use an idempotency key or another stable intent identifier at creation time, then make the operation discoverable by that identity. The client can safely ask, “What happened to the import I requested?” before it asks again. This is the success-path companion to [Idempotency Keys Are the Seatbelt for AI Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-27-idempotency-keys-are-the-seatbelt-for-ai-agents/).

Do not mistake the operation record for an audit log. It is the current, caller-relevant state of one intent. A separate trace can show each queue attempt, downstream call, and retry without forcing the agent to reason from raw diagnostic events. [Agent Tool Calls Need Traces, Not Just Logs](https://my-slops.github.io/Blog/posts/2026/08/agent-tool-calls-need-traces-not-just-logs/) explains why that distinction matters during investigation.

### Completion needs an observation policy

There are several valid ways for a caller to learn that work completed:

- poll the operation resource until it reaches a terminal state;
- receive a signed, deduplicated webhook that names the operation ID and terminal state;
- wait synchronously only up to a declared deadline, then return the operation for later follow-up; or
- have a trusted workflow engine resume a durable task from the operation event.

The right choice depends on latency, volume, and interaction style. A five-second image resize may reasonably wait. A multi-hour data export should not keep an HTTP request open merely so the response can say “complete.”

Whichever mechanism you choose, define the observation boundary. A worker writing `completed` to its own process log is not enough if the public result has not been persisted. A webhook delivery attempt is not enough if the receiver has not acknowledged it. A final status must refer to the outcome your user actually cares about.

### Test the gap between accepted and complete

Tests that assert only that an API returns `202` are testing admission, not the operation lifecycle. Exercise the states an agent can misreport:

```text
Given: an import request is accepted
When: the worker later rejects the third CSV file
Then: operation.state becomes failed
And: the agent must not report a completed import

Given: a client retries after losing the create response
When: it uses the original idempotency key
Then: it receives the original operation ID, not a second import

Given: an operation succeeds after the interactive deadline
When: the user returns later
Then: the operation resource reports the final imported count
```

Add a test for the unhappy middle: an operation that is accepted but remains running beyond the user-visible deadline. That state should produce an honest progress or follow-up answer, not a timeout message that claims the work failed and not a success message that claims it finished.

## Steps / Code

Before exposing a tool that starts asynchronous work, answer these questions in its contract:

1. What exact event makes a request accepted?
2. What durable identifier names this logical intent?
3. Which states are non-terminal, and which outcome makes each terminal state true?
4. Where can a caller obtain the current state without parsing logs?
5. How are retries mapped back to the original operation?
6. What may an agent tell a user at each state?
7. What happens if completion occurs after the interactive session ends?

Avoid a progress percentage unless it has a stable meaning. “80%” is worse than no percentage when retries, fan-out, or a slow final validation can make the remaining 20% take most of the job. A named state plus a meaningful count or checkpoint is usually more useful.

## Trade-offs

Operation resources add storage, retention rules, state-transition code, and an authorization surface. A polling endpoint can create load; webhooks require delivery, signature, and deduplication logic. For a genuinely quick and atomic action, this machinery is unnecessary.

The boundary can also be domain-specific. A payment may be “succeeded” when authorized, captured, or settled, depending on the product promise. A document import may be complete only after validation, ingestion, and search indexing—or it may expose those as separate operations. The API cannot avoid those choices; it can only hide them in an unreliable `ok: true` field.

My preference is to reserve operation lifecycles for work whose result can outlive the request or whose side effects cannot be truthfully established at acceptance time. In those cases, a little statefulness is cheaper than teaching every caller to reverse-engineer whether “started” meant “done.”

## References

- IETF, [RFC 9110 §15.3.3: 202 Accepted](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.3)
- This repository, [A Tool Error Is an Instruction to Your Agent](https://my-slops.github.io/Blog/posts/2026/09/2026-09-21-a-tool-error-is-an-instruction-to-your-agent/)
- This repository, [Idempotency Keys Are the Seatbelt for AI Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-27-idempotency-keys-are-the-seatbelt-for-ai-agents/)
- This repository, [Agent Tool Calls Need Traces, Not Just Logs](https://my-slops.github.io/Blog/posts/2026/08/agent-tool-calls-need-traces-not-just-logs/)

## Final Take

The line between acceptance and completion is where many reliable-looking agent workflows become misleading.

Make the start visible. Give it an operation ID. Model its terminal outcome explicitly. Then let an agent report what it knows: work accepted, work running, or work completed. Nothing about an asynchronous system becomes less asynchronous because a tool returned quickly.

## Recovery Notes

- Scheduled slot: `2026-10-01T10:00:00-04:00` (`America/Montreal`).
- Actual replay time: `2026-10-02T03:15:26-04:00` (`America/Montreal`).
- The post date and `scheduled_at` preserve the recovered slot; the replay time is recorded separately and is not used as publication metadata.

## Changelog

- 2026-10-01: Initial publication for recovered scheduled slot `2026-10-01T10:00:00-04:00`.
