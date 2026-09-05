---
title: "Prompt Caching Makes Prompt Layout a Production Interface"
date: "2026-09-05"
updated: "2026-09-05"
slug: "prompt-caching-makes-prompt-layout-a-production-interface"
description: "Prompt caching does more than reduce input-token cost. Once a system relies on it, the ordering and stability of instructions, tools, history, and per-request data become an operational interface."
summary: "A prompt cache reuses an exact rendered prefix, not an abstract idea of a similar prompt. Structure stable context deliberately, put volatile work at the tail, and measure cache changes like any other production interface change."
tags:
  - ai agents
  - prompt engineering
  - developer tooling
  - performance
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/09/prompt-caching-makes-prompt-layout-a-production-interface/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

Prompt caching is often presented as a billing feature: repeat a large prompt and pay less for the repeated input. That is true, but it hides the design consequence.

Once an application depends on a prompt cache, the *layout* of its rendered context becomes a production interface. Stable developer instructions, tool definitions, and retained history belong in a deliberate prefix. The task-specific request belongs after them. A harmless-looking change near the beginning—a reordered tool list, a timestamp in a system message, a freshly serialized settings object—can turn a high-hit workload into a cold one.

This is not a reason to freeze prompts forever. It is a reason to treat prompt layout as something versioned, measured, and changed on purpose.

## Context

An agent request is rarely just a user message. By the time a provider receives it, it may include application instructions, tool schemas, prior turns, retrieved material, output schemas, and provider-supplied context. Engineers tend to think about those pieces in semantic terms: which instructions are important, which tools are available, what the user asked.

A cache sees a different object. It sees a rendered prefix.

OpenAI's current prompt-caching documentation is unusually explicit about this distinction. It says that cache reuse requires the entire rendered prefix to match, and that the rendered context includes developer instructions, tool definitions, and conversation history. The cached object is saved key-value state, not a loose comparison of two similar prompts. A request can reuse the state only while a matching entry is available.

That means an agent can be semantically unchanged and operationally different. Moving a stable tool definition, regenerating JSON fields in a different order, or inserting request metadata before the durable instructions can invalidate everything that follows the change.

The useful mental model is not “cache my prompt.” It is “design a stable prefix boundary.”

## Key Points

### The prefix is a contract between turns

For a multi-turn assistant, a healthy request shape usually separates durable context from per-turn work:

```text
stable application instructions
stable tool definitions and schemas
retained conversation history
--------------------------------
current user input
turn-specific retrieved material
ephemeral request metadata
```

The divider is conceptual, not a special token. Its job is to make one fact easy to maintain: the rendered content above it should remain unchanged whenever the task does not require a change.

Do not confuse “stable” with “global.” A tenant-specific policy or user-specific conversation may legitimately be in the prefix for that tenant or conversation. It simply should not be rebuilt from an unordered map or salted with a new timestamp on every call. The cache boundary follows the work that repeats, not the work you wish repeated.

This has a second benefit even when caching is unavailable: it makes prompt changes reviewable. A reviewer can identify whether a modification changes the application envelope, accumulated state, or only the current request.

### Tool availability and tool definitions are different things

Dynamic tools are a common way to accidentally destroy a stable prefix. A product may remove definitions from the request whenever it wants to disable a tool for a particular turn. That changes the context before the current user input, so a cache cannot match the previous prefix.

OpenAI recommends preserving tool definitions, their ordering, and their schemas when they are needed across requests. Where its API supports it, a caller can restrict the tools that are callable for a turn without removing the underlying definitions. It also recommends adding newly discovered tools at the end of the context rather than rewriting earlier context.

The broader engineering lesson is useful even outside that API: keep the registry representation stable, and express per-turn authorization separately when your platform allows it. This is not a substitute for authorization. The [Tool-Scope Contract](https://my-slops.github.io/Blog/posts/2026/03/2026-03-20-the-tool-scope-contract-for-llm-agents/) still belongs outside the prompt in policy-enforced code. A cache key or a stable tool list must never become a permission boundary.

### Put observability metadata at the tail—or out of the prompt

Request IDs, current timestamps, experiment labels, trace links, and runtime flags are valuable. They are also usually volatile. If they appear near the top of a developer message, they make every later token a different prefix.

Prefer to put operational metadata in trace attributes, application logs, or request fields that the model does not need to read. When the model genuinely needs a small piece of it, put it with the current-turn suffix. That preserves the reusable context while keeping the model informed.

The same rule applies to retrieval. A stable corpus description or retrieval policy can live in the application envelope. Fresh search results should normally be appended with the current task. Reordering the whole prompt just to place a new document “near the top” is an expensive trade-off: it may help answer quality, but it gives up prefix reuse. That quality-versus-performance decision should be tested, not treated as a formatting preference.

### Conversation compaction is a cache decision too

Compaction often sounds unquestionably efficient: replace an old transcript with a shorter summary and lower input size. But replacement changes history, which can discard a cacheable prefix. For a frequently active thread, a large rewrite can create a temporary latency and cost spike even while it reduces the long-run context size.

That does not make compaction wrong. It makes it a two-variable optimization:

1. How much input will the new representation remove over future turns?
2. How much reusable prefix will this rewrite forfeit, and for how long?

For a short-lived task, aggressively compacting may be sensible. For a busy support thread with a stable conversation and many follow-ups, preserving history until a natural boundary can be cheaper and faster. The answer depends on turn frequency, context growth, and the provider's cache lifetime—not on an abstract preference for either full history or summaries.

### A cache hit is not a correctness result

A team can improve a cache-hit rate while making answers worse: perhaps it keeps stale retrieval context too long, refuses to revise a misleading instruction, or overuses a giant tool registry because it is convenient to cache. The performance metric is evidence about repeated computation, not evidence that the agent made a good decision.

Measure cache behavior alongside the outcomes that matter. For example:

- cached versus uncached input tokens and end-to-end latency;
- cache behavior by agent version and conversation type;
- evaluation quality after a prompt-layout or tool-schema change;
- error and timeout rates for tool-using turns.

This is an extension of the [eval-first discipline](https://my-slops.github.io/Blog/posts/2026/04/2026-04-01-eval-first-llm-workflow/): prompt layout changes deserve a before-and-after comparison, not a confident guess based on one fast demo.

## Steps / Code

### A deliberately shaped request

The following is pseudocode. Its point is the boundary and versioning, not a provider-specific API shape.

```ts
function buildAgentContext(turn: Turn) {
  return [
    developerMessage({
      // Version this as a product interface. Keep serialization deterministic.
      policyVersion: "support-agent-v6",
      instructions: STABLE_INSTRUCTIONS,
    }),
    toolDefinitions(STABLE_TOOL_REGISTRY),
    ...turn.retainedHistory,

    // Everything below this line is expected to vary per request.
    userMessage(turn.userInput),
    retrievedContext(turn.searchResults),
    developerMessage({ requestMode: turn.mode }),
  ];
}

const response = await runModel({
  input: buildAgentContext(turn),
  allowedTools: toolsAllowedFor(turn),
  traceContext: trace.current(),
});
```

Three details matter more than the exact function names:

1. Serialize the stable portion deterministically. Do not allow an object iteration order, a random example, or a current time to leak into it.
2. Version a meaningful envelope change. A model-instruction or tool-schema migration is a cache event as well as a behavior change.
3. Keep `allowedTools` and tracing data outside the stable prompt prefix when the API supports that separation.

### Review prompt changes like interface changes

Before merging a change to agent context, ask:

```text
- Which portion of the rendered context changes?
- Is that portion intentionally stable or intentionally volatile?
- Will a tool, schema, or instruction migration invalidate active prefixes?
- Do we expect the cache ratio to change by conversation type?
- What evaluation or production metric tells us whether the change was worth it?
```

This is small enough to add to ordinary code review. It avoids the more expensive alternative: discovering after a deployment that every request became cold because a harmless analytics field moved into the first message.

## Trade-offs

Cache mechanics are provider- and model-specific. Minimum cacheable length, expiry, routing behavior, retention controls, and the ability to choose cache boundaries can all differ. Do not copy an optimization from one model family into another without checking the current documentation and measuring the result.

There is also a maintainability cost. A stable envelope can become too precious if engineers resist needed policy, tool, or safety updates solely to preserve cache hits. Correctness and safety win. The practical response is to make the migration visible, deploy it deliberately, and expect a temporary performance change—not to avoid it.

Finally, prompt caching does not relax normal data handling. A cached rendered context can include instructions, tool definitions, and conversation history. Continue to minimize sensitive content, follow the provider's retention and regional-processing documentation, and keep confidential diagnostic payloads out of ordinary telemetry.

## References

- OpenAI, [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- This repository, [The Two-Anchor Pattern for Long-Context Prompts](https://my-slops.github.io/Blog/posts/2026/03/2026-03-25-the-two-anchor-pattern-for-long-context-prompts/)
- This repository, [The Tool-Scope Contract for LLM Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-20-the-tool-scope-contract-for-llm-agents/)
- This repository, [Stop Prompt-Tuning Blind: An Eval-First Workflow for Reliable LLM Apps](https://my-slops.github.io/Blog/posts/2026/04/2026-04-01-eval-first-llm-workflow/)

## Final Take

Prompt caching rewards repetition, but useful agents are not identical from turn to turn. The design problem is deciding which part of the context is allowed to repeat.

Make that prefix intentional: stable instructions, stable schemas, retained history, then the new work. Measure what happens when it changes. The payoff is not merely lower token cost; it is a prompt architecture that is easier to review, debug, and evolve.

## Changelog

- 2026-09-05: Initial publish.
