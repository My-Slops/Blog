---
title: "Agent Tool Calls Need Traces, Not Just Logs"
date: "2026-08-26"
updated: "2026-08-26"
slug: "agent-tool-calls-need-traces-not-just-logs"
description: "A tool log can say that a call failed without showing which model decision created it. Distributed traces connect an agent turn, its tool selection, and downstream work into one debuggable request."
summary: "Tool logs answer what ran. A trace answers which agent decision caused it, what it waited on, and whether the failure belongs to the model, orchestration, or downstream service."
tags:
  - ai agents
  - observability
  - distributed systems
  - reliability
  - developer tooling
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/agent-tool-calls-need-traces-not-just-logs/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

An agent transcript can tell a persuasive story about a task. It is a poor debugging record.

When a user request becomes a model turn, a tool call, an HTTP request, a queue job, and perhaps another model turn, logs from those pieces do not automatically explain one another. Give the whole request a distributed trace, and create spans for the model invocation, tool selection, tool execution, and important downstream calls. Then a slow or failed tool call becomes attributable to a decision and a dependency instead of a line in a noisy log stream.

## Context

“The agent was slow” is usually not a diagnosis. It can mean that the model took a long time to produce a tool call, that the selected tool queued behind other work, that the tool made a slow downstream request, or that the orchestrator retried after a timeout. A chat transcript often collapses all of this into a single message such as “Searching now.” Application logs commonly replace it with a request ID that the tool service never receives.

That gap matters more in agents than in ordinary request handlers. A conventional endpoint often has a fairly fixed call graph. An agent creates part of its call graph at runtime: the model chooses whether to call a tool, which tool to call, what arguments to pass, and whether to make another turn afterward. Without correlation, the investigation has to reconstruct that graph from timestamps, text, and guesswork.

Logs are still useful. They preserve discrete facts, detailed errors, and audit events. But a log line saying `calendar.lookup completed in 2.4s` cannot answer the operational question that matters: *which user task and which agent decision were waiting for those 2.4 seconds?*

## Key Points

### 1) Treat an agent turn as a trace root, not a log session

Start one trace when the system accepts a user task. The root should cover the reader-visible operation: for example, “prepare a meeting brief,” not merely “call the LLM.” Add child spans for work that has an independent failure or latency story:

```text
agent.request
├─ model.plan
├─ tool.calendar.lookup
│  └─ http.calendar-api GET /events
├─ tool.docs.search
│  └─ vector-store.query
└─ model.compose
```

This shape makes an important distinction visible. `model.plan` records the time to decide. `tool.calendar.lookup` records the orchestration boundary. `http.calendar-api` records the downstream dependency. If the request takes nine seconds, the trace can show whether that time was model inference, queueing, a remote service, or agent control flow.

OpenTelemetry defines a trace as a collection of spans, with each span representing an operation. That model fits tool-using agents unusually well because the span tree documents the runtime path the agent actually took—not the path its designer expected it to take.

### 2) Propagate context across the boundary where ownership changes

The most valuable trace break to avoid is usually the tool boundary. An orchestrator may know it called `search_docs`; the search service may know it queried a vector database; neither knows the other’s request ID unless context crosses the network boundary.

For HTTP, the W3C Trace Context standard defines the `traceparent` header. In its current `00` format, it carries a version, trace ID, parent ID, and trace flags. Instrumentation should create a new child span for outbound work while preserving the trace ID, so the receiver can join the same distributed trace.

Do not hand-roll this header in application code. Use your tracing SDK or framework instrumentation. The standard exists so different services and tracing vendors can correlate work; ad hoc IDs usually recreate the problem with weaker propagation and more maintenance.

### 3) Capture the decision boundary, but not the whole conversation by default

Agent traces need a little more semantic context than a typical HTTP trace. Record fields that let an engineer answer why work occurred:

- the agent/workflow name and version;
- a stable task or conversation identifier, preferably non-sensitive;
- the model deployment or model alias actually selected;
- tool name, tool schema version, and a small argument classification such as `read_only` or `external_write`;
- retry count, timeout/deadline outcome, and normalized error type;
- token and cost metrics when the platform exposes them.

Avoid putting raw prompts, retrieved documents, credentials, or full tool arguments into routine span attributes. Trace systems replicate and retain data in ways application teams do not always expect. If an incident genuinely needs sensitive payloads, use a separately access-controlled audit path with an explicit retention policy.

This is also why trace context is not a substitute for authorization logs. The [Tool-Scope Contract](https://my-slops.github.io/Blog/posts/2026/03/2026-03-20-the-tool-scope-contract-for-llm-agents/) asks whether a tool action was allowed. A trace answers how that allowed action moved through the system. Mature agent operations need both.

### 4) Make retries and fan-out visible as structure

An agent may retry one failed tool call or launch several independent reads. If those attempts overwrite one log field, an incident reviewer sees one “search failed” event and loses the shape of the failure.

Create a span per attempt, with the attempt number and outcome. For concurrent calls, use sibling spans rather than pretending they were sequential. The resulting trace makes two common mistakes obvious:

- retries that continue after the user-visible deadline has effectively expired;
- fan-out that turns one simple request into dozens of slow downstream calls.

The first connects directly to [deadline budgets](https://my-slops.github.io/Blog/posts/2026/03/2026-03-30-deadline-budgets-are-the-missing-guardrail-for-ai-agents/): no amount of observability rescues a call that should never have started because no useful time remained. The second can reveal an agent policy problem rather than an infrastructure regression.

## Steps / Code

### A minimal instrumentation contract

The exact API differs by language and SDK. The structure below is illustrative pseudocode; the important part is the parent-child relationship and bounded attributes.

```ts
async function withSpan(name, attributes, operation) {
  return tracer.startActiveSpan(name, async span => {
    try {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
      return await operation();
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

await withSpan("agent.request", {
  "agent.name": "research-assistant",
  "agent.version": buildVersion,
  "task.kind": "meeting_brief"
}, async () => {
  const plan = await withSpan("model.plan", {}, runModel);

  await Promise.all(plan.toolCalls.map(call =>
    withSpan(`tool.${call.name}`, {
      "tool.name": call.name,
      "tool.mode": call.isReadOnly ? "read" : "write",
      "agent.turn": plan.turn
    }, () => executeTool(call, { signal: remainingDeadline.signal }))
  ));
});
```

Keep one further discipline: instrument tool *selection* even when execution is denied or skipped. A policy denial, expired deadline, or validation failure is often the most useful outcome to investigate. It explains why a user did not get a result without inventing a downstream failure that never occurred.

### What to look for in the first week

Do not begin with an enormous dashboard. Sample real traces and ask a few concrete questions:

1. Which tool span dominates end-to-end latency for successful tasks?
2. Are model turns slow before the first tool call, or are tools slow after a quick decision?
3. Which tools generate retries, and are the retries still within the request deadline?
4. Does one agent version produce a meaningfully wider fan-out than the previous version?
5. Can an on-call engineer move from a user-visible error to the responsible dependency without joining logs by hand?

If the answer to the last question is no, add correlation at the first broken boundary before collecting more attributes.

## Trade-offs

Tracing costs storage, instrumentation effort, and some runtime overhead. High-cardinality attributes can make those costs much worse, and detailed payload capture can create a privacy and security problem. Sampling also means that the one failure a customer reports may not be present.

For low-volume or high-value agent workflows, I prefer retaining complete traces for a short window with strict attribute controls. For high-volume traffic, start with a modest head-sampling rate, then add tail sampling or targeted retention for errors and slow traces if the tracing backend supports it. The right policy depends on volume, sensitivity, and incident needs—not on a universal percentage.

Tracing also will not tell you whether the model chose the *right* tool. That is an evaluation question. It will tell you, with far less ambiguity, what the model chose, what ran afterward, and where the time or failure accumulated.

## References

- W3C, [Trace Context](https://www.w3.org/TR/trace-context/)
- OpenTelemetry, [Traces](https://opentelemetry.io/docs/concepts/signals/traces/)
- OpenTelemetry, [Context propagation](https://opentelemetry.io/docs/concepts/context-propagation/)
- This repository, [The Tool-Scope Contract for LLM Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-20-the-tool-scope-contract-for-llm-agents/)
- This repository, [Deadline Budgets Are the Missing Guardrail for AI Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-30-deadline-budgets-are-the-missing-guardrail-for-ai-agents/)

## Final Take

An agent’s transcript is an explanation it generated. A trace is evidence about what the system did.

Instrument the point where the model makes a tool decision, carry context through the tool boundary, and keep downstream work in the same trace. Then incidents stop being a scavenger hunt across chat history and service logs, and become an inspectable execution path.

## Changelog

- 2026-08-26: Initial publish.
