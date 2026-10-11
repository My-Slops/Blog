---
title: "Stop Calling Tools Read-Only Before You Define Their Effects"
date: "2026-10-11"
updated: "2026-10-11"
slug: "stop-calling-tools-read-only-before-you-define-their-effects"
description: "A tool is not safe for autonomous use merely because it is named search, uses GET, or returns data. Its intended domain effect, operational side effects, and access surface need separate contracts."
summary: "Treat read-only as a reviewed promise about what an agent is asking the system to do. Do not infer it from an HTTP verb, GraphQL operation type, or absence of an obvious SQL write."
tags:
  - ai agents
  - api design
  - developer tooling
  - reliability
  - safety
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/stop-calling-tools-read-only-before-you-define-their-effects/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

“Read-only” is often used as a shortcut for “safe to call without asking.” That shortcut is only trustworthy when it describes a reviewed contract—not when it was inferred from a tool name, an HTTP `GET`, a GraphQL `query`, or a SQL statement that happens to begin with `SELECT`.

For an agent, classify each tool by the effect the caller is asking it to produce, the operational effects it may trigger, and the data it can expose. A search that only reads a customer index can be broadly automatable. A search that starts a paid export, warms a third-party service, records a user-visible subscription, or returns secrets is a different kind of capability even if its endpoint is called `GET /search`.

## Context

An agent is allowed to use a supposedly read-only tool to find a document. The tool is called `search_documents`, so the runtime gives it a generous call budget and skips approval.

The implementation does more than retrieve documents. On a cache miss, it asks a paid external service to refresh an index. When the query contains `include=full_export`, it creates a downloadable archive. The archive URL is visible to anyone who sees the tool transcript.

None of those details are implied by the word *search*. The name describes an answer-shaped result, not the effect contract. Yet names, route verbs, and implementation guesses are routinely used as authorization labels for agent tools.

HTTP makes an important distinction here. A safe method is one where the client does not request or expect a state change. That does **not** mean its implementation causes no writes at all: access logs and advertising charges are ordinary examples in [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.1). The distinction is useful, but it is not an authorization model. An agent runtime needs to know what it is permitted to ask for, what it might consume or trigger, and what it could reveal after the answer arrives.

## Key Points

### “No intended domain write” is one property

The first question is the one people usually mean by read-only:

> Does this invocation ask the product to change a customer-facing or business-relevant state?

`find_invoice`, `get_deployment_status`, and `list_open_incidents` can usually answer “no.” `send_invoice`, `restart_deployment`, and `acknowledge_incident` cannot.

This is the property that should control whether a model may autonomously perform the *requested action*. It is also the sense used by HTTP safe methods. RFC 9110 explicitly says that a resource owner must not hide an unsafe action behind a safe method such as a `GET`; automated fetchers and link checkers are allowed to follow safe links without discovering a deletion side effect.

That makes a label like `read_only` a product promise. It should mean that all supported arguments preserve the no-domain-write invariant. A tool is not read-only if one obscure filter, flag, or URL parameter turns the same call into an enrollment, export, notification, or write.

### Operational effects still deserve a budget

No requested domain write does not mean no cost. Safe HTTP requests may be logged, metered, or cause cache activity without violating HTTP semantics. Those effects are normally reasonable because the caller did not ask for them and cannot be held accountable for them.

But an agent runtime still has to account for them. A search endpoint that creates an expensive warehouse query, fans out to five vendors, or causes a cache refresh is not equivalent to an in-memory lookup. The right response is usually not to reclassify every cache fill as a write. It is to give the tool a bounded operational contract:

- a maximum result size and page count;
- a request, cost, or time budget;
- declared external dependencies where that affects reliability or data handling; and
- a clear statement that repeated calls may be rate-limited or billed.

This lets the runtime permit ordinary investigation while preventing an agent from turning “find the latest invoice” into a runaway sequence of broad searches. [Rate Limits Need a Budget the Client Can See](https://my-slops.github.io/Blog/posts/2026/07/rate-limits-need-a-budget-the-client-can-see/) makes the complementary point: a failure response is too late to be the only scheduling interface.

### A read can still be a sensitive capability

The other missing dimension is disclosure. `get_customer_record` may not mutate anything, but it may return a home address, a support transcript, or a credential reset link. A model given indiscriminate read access can leak information in a final answer, copy it to a second tool, or use it to infer something a user was not authorized to know.

So “read-only” should never be read as “low privilege.” Read access needs its own resource scope, tenant boundary, field filtering, and result-handling policy. The cache-key problem has the same shape: a response is safe to reuse only when the next requester is entitled to the same representation. [The Cache Key Is a Privacy Boundary](https://my-slops.github.io/Blog/posts/2026/08/the-cache-key-is-a-privacy-boundary/) explains why treating data retrieval as harmless after authorization is a costly mistake.

For an agent tool, name what may be returned and what must not leave the tool result. If a tool can retrieve a secret, a signed URL, or content from another tenant, give it a more specific capability label than `read_only` and keep the output out of conversational context unless that exposure is actually required.

### Transport syntax cannot prove the contract

An HTTP `GET` is a useful signal, not proof that a tool is suitable for automatic use. The specification calls `GET`, `HEAD`, `OPTIONS`, and `TRACE` safe because of their *defined request semantics*; it also says that applications must disallow an unsafe action reached through a safe method. A `GET /reports?create=true` is therefore a service bug, not a clever exception.

The same caution applies below and above HTTP:

- A GraphQL mutation conventionally represents top-level side effects and is executed serially, but a schema name does not substitute for reviewing resolver behavior.
- A SQL `SELECT` is not automatically side-effect-free when it invokes a function. PostgreSQL documents that `nextval` advances a sequence even when it appears in a `SELECT`, and its volatility rules allow functions that modify database state.
- A `POST` is not necessarily high-risk. A well-designed calculation or search endpoint may need a request body for a large query while still making no domain change.

Do not build an agent policy that says `GET = safe`, `query = safe`, or `SELECT = safe`. Use those as testable implementation constraints after the tool's semantic contract is already defined.

### Put the contract next to the tool declaration

The runtime should have a compact, reviewable record for each callable operation. This is illustrative TypeScript, not a universal schema:

```ts
type ToolEffects = {
  // What the caller is asking the product to do.
  requestedEffect: "none" | "domain_write" | "external_write";

  // Effects that can happen while serving an otherwise read-only request.
  operationalEffects: Array<
    "audit_log" | "cache_fill" | "metered_query" | "external_lookup"
  >;

  // Controls that apply even when requestedEffect is "none".
  dataClass: "public" | "workspace" | "sensitive" | "secret";
  automaticUse: "allowed" | "bounded" | "approval_required";
  maxCallsPerTask?: number;
};

const searchDocuments: ToolEffects = {
  requestedEffect: "none",
  operationalEffects: ["audit_log", "metered_query"],
  dataClass: "workspace",
  automaticUse: "bounded",
  maxCallsPerTask: 8,
};
```

The exact fields matter less than the separation. `requestedEffect` decides whether an action is a mutation. `operationalEffects` informs budgets, retries, and observability. `dataClass` decides which credentials, transcript paths, and downstream tools are appropriate. `automaticUse` is a policy decision, not a label inferred by the model.

This also makes reviews sharper. When a maintainer adds `includeHistory` to a search tool, the question is not merely whether the parameter validates. It is whether it changes returned data classification, cost, or the no-domain-write promise. If it does, update the declaration and the runtime policy in the same change.

## Steps / Code

Before marking a tool broadly callable, test its contract from the caller's perspective:

1. Can any supported input create, enroll, send, delete, reserve, or start work that persists after the response?
2. What costs, rate limits, cache refreshes, or external requests can the call trigger?
3. Which resources and fields can appear in its output, including pagination, debug modes, and signed links?
4. Can the runtime enforce a call count, deadline, result-size limit, and tenant scope without asking the model to remember them?
5. Does a timeout leave a domain outcome unknown, or was the action definitely a retrieval failure?
6. Are the HTTP, GraphQL, or database conventions covered by a contract test rather than trusted by name?

For the last item, include a negative test. If an endpoint is declared read-only, assert that a representative invocation does not create a domain record, enqueue work, send a notification, or alter a user-visible subscription. Separately test its maximum query and result bounds. Testing only that it returns 200 proves neither property.

## Trade-offs

This approach adds metadata and forces teams to discuss details that a thin wrapper would hide. Some internal tools genuinely are simple enough that `requestedEffect: "none"` plus a small result cap is all they need.

There is also a risk of treating any infrastructure write as a reason to require approval. That would make normal reading unusable: logging, cache population, and metrics are legitimate implementation details. The useful boundary is whether the caller asked for a meaningful domain or external effect, then whether the incidental operational effects stay inside declared limits.

The conservative edge case is a tool whose behavior changes with arguments, feature flags, or caller identity. Do not grant the broadest label to its friendly path. Split it into separate operations or give the entire surface the stricter policy until the invariants are enforceable.

## References

- IETF, [RFC 9110 §9.2.1: Safe Methods](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.1)
- PostgreSQL, [Function Volatility Categories](https://www.postgresql.org/docs/current/xfunc-volatility.html)
- PostgreSQL, [`nextval` sequence semantics](https://www.postgresql.org/docs/current/functions-sequence.html)
- GraphQL Foundation, [GraphQL specification §6.2: query and mutation execution](https://spec.graphql.org/October2021/#sec-Execution)
- This repository, [The Tool-Scope Contract for LLM Agents](https://my-slops.github.io/Blog/posts/2026/03/2026-03-20-the-tool-scope-contract-for-llm-agents/)
- This repository, [A Tool Error Is an Instruction to Your Agent](https://my-slops.github.io/Blog/posts/2026/09/2026-09-21-a-tool-error-is-an-instruction-to-your-agent/)

## Final Take

“Read-only” is not a permission level, a protocol verb, or an implementation accident. It is a promise about the action the caller is allowed to request.

Make that promise explicit. Then separately disclose the tool's operational budget and data-access surface. An agent can safely automate investigation only when those three facts stay legible—and true—across every argument and implementation path.

## Changelog

- 2026-10-11: Initial publication.
