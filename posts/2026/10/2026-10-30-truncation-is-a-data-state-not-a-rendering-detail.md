---
title: "Truncation Is a Data State, Not a Rendering Detail"
date: "2026-10-30"
updated: "2026-10-30"
slug: "truncation-is-a-data-state-not-a-rendering-detail"
description: "A clipped tool response is evidence with an explicit coverage boundary. Agents must preserve that boundary instead of treating the visible prefix as a complete result."
summary: "Make completeness machine-readable in every list, search, log, and generated-report tool. A result that was cut short may support a local observation, but not a global conclusion."
tags: [ai agents, api design, reliability, developer tooling, verification]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/truncation-is-a-data-state-not-a-rendering-detail/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

When a tool returns the first 100 records, clips a command after 20,000 characters, or stops generation at an output limit, the missing suffix is part of the result's meaning. It is not merely a presentation problem.

An agent may safely say what it observed in the returned prefix. It may not turn that prefix into claims such as "there are no other failures," "all invoices are paid," or "these are the only matching accounts" unless the tool proves that the result is complete for the requested scope.

Tool contracts should make three facts explicit: whether the result is complete, what scope it covers, and how to continue or deliberately stop. Hiding a cursor or a truncation flag in prose turns a deterministic boundary into a model judgment call.

## Context

An incident agent runs a log search for failed payment exports. The wrapper returns this:

```text
1,000 matching events shown
…
2026-10-30T14:02:16Z export=exp_481 state=failed reason=upstream_timeout
[output truncated]
```

The agent sees no authorization failures in the visible events and replies: "There were no authorization failures."

That answer is not supported. It has established only a narrower fact: no authorization failure appeared in the returned prefix. The omitted records might contain one; the search service might have sorted by relevance rather than time; or the wrapper might have cut the output in the middle of the only relevant record.

This sounds obvious when the literal string `[output truncated]` is visible. It is much easier to miss when truncation is implicit:

- a list endpoint returns its default page without exposing response headers to the model;
- a connector silently caps a search at 50 hits;
- an orchestration layer converts a long tool result to a shorter string to fit its context budget;
- a report generator reaches a model output limit and returns valid-looking JSON with a partial array.

All four cases produce an answer-shaped payload. None proves that the payload is the whole answer.

## Key Points

### Completeness is evidence, not formatting metadata

A tool result does not consist only of its records. It also says—or fails to say—how those records relate to the question asked.

Compare these two contracts:

```json
{ "items": [{ "id": "acct_12" }, { "id": "acct_17" }] }
```

```json
{
  "items": [{ "id": "acct_12" }, { "id": "acct_17" }],
  "coverage": {
    "state": "partial",
    "reason": "page_limit",
    "returned": 2,
    "nextCursor": "opaque-cursor"
  }
}
```

The first object forces a caller to guess. The second permits a caller to reason: it knows two matching accounts exist, it knows the set is incomplete, and it knows how to request the next portion if doing so remains authorized and useful.

This is an ordinary API design issue, not an agent-only concern. GitHub's REST API uses a `Link` response header to identify additional pages when a result is paginated; clients must follow the `next` relation to obtain the full result. [GitHub's pagination guidance](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api) also warns that a requested `per_page` value above an endpoint's maximum can be reduced without an error. A successful response can therefore be smaller than the caller expected.

Kubernetes makes the distinction especially clear. A chunked list has a `continue` value while more items remain, and a client reaches the full collection only when that value is empty. Its API documentation notes that a page can contain fewer items than the requested limit—even zero—and that clients should use `continue`, not page length, to decide whether more results exist. [Kubernetes API concepts](https://kubernetes.io/docs/reference/using-api/api-concepts/) describes this as a consistent multi-page snapshot.

The same discipline belongs in an agent tool wrapper. Do not make the model infer completeness from an array's length, a successful HTTP status, or the absence of an error string.

### A prefix supports positive findings more readily than negative conclusions

If a clipped result contains `export=exp_481 state=failed`, the agent can safely report that it observed a failed export, subject to ordinary freshness and source-scope limits. It cannot say that it found *every* failed export, or that no other state occurred, unless the result is complete for that claim.

This asymmetry matters in reviews and incident response. A partial scan may justify "I found these affected resources" but not "only these resources are affected." A partial policy search may justify "this document permits the action" only with careful provenance and scope; it cannot establish that no conflicting policy exists outside the searched corpus.

The archive already makes the empty-result version of this point in [An Empty Search Result Is Not Evidence That Nothing Exists](https://my-slops.github.io/Blog/posts/2026/10/an-empty-search-result-is-not-evidence-that-nothing-exists/). Truncation is the positive-result counterpart: seeing *some* matches does not establish that the visible sample is the full set.

Do not repair this by instructing a model to "be careful with long results." The runner has the relevant fact before the model sees any text. Make it structured and enforceable.

### Continuation is an option, not an obligation

A `nextCursor` answers a narrow question: how can the caller ask for the next page? It does not answer whether it should.

Continuing can be expensive, exceed a task deadline, disclose more data than the user requested, or broaden a search beyond the approval that covered the first page. The right response to a partial result may be to continue, narrow the query, report the coverage limit, or ask for authorization to inspect more.

That boundary matters especially for agents. [A Page Cursor Is Not Permission to Keep Reading](https://my-slops.github.io/Blog/posts/2026/10/a-page-cursor-is-not-permission-to-keep-reading/) explains why pagination state cannot silently expand delegated scope. A good result contract separates the evidence boundary from the policy decision:

```ts
type SearchResult<T> = {
  items: T[];
  coverage: {
    state: "complete" | "partial" | "unknown";
    reason?: "page_limit" | "byte_limit" | "time_limit" | "upstream_limit";
    asOf?: string;
    continuation?: { cursor: string; expiresAt?: string };
  };
};
```

The type does not grant permission to use `continuation`. It prevents a caller from pretending the option was unnecessary.

### Preserve truncation through every layer

The upstream API may correctly provide pagination metadata, then an adapter can erase it on the way to the model:

```text
API response → connector → tool schema → agent runtime → prompt renderer → model
```

Every handoff can change completeness. A connector might merge the first three pages but stop at its own record cap. A runtime might trim an otherwise complete response to fit context. A renderer might omit headers because they are inconvenient to display. If the final tool result only contains `items`, the model cannot tell which layer set the actual boundary.

Keep a machine-readable state until the action or answer is complete. If the layer cannot preserve the original cursor, it should still report its own cutoff honestly:

```json
{
  "coverage": {
    "state": "partial",
    "reason": "agent_context_byte_limit",
    "returnedBytes": 20000,
    "continuation": null
  }
}
```

`continuation: null` is useful. It tells the agent that it cannot recover completeness by guessing at a URL or replaying an opaque request. The safe next step may be a narrower server-side query, an aggregate endpoint, or an explicit human handoff.

For an output generated by a model or report formatter, use a different state from a successful complete report. A syntactically valid closing brace does not prove that every intended item was emitted. Record the requested output contract, the completion reason, and any count the producer can establish. Otherwise downstream code can treat a structurally valid partial report as an exhaustive plan.

### Test the claim, not just the pagination loop

Many API tests assert that a client follows a cursor. That is necessary but incomplete for an agentic system. The meaningful failure is often in the final sentence.

Add fixtures such as:

| Tool state | Unsafe claim to reject | Acceptable response |
| --- | --- | --- |
| Page has `nextCursor` | "These are all inactive accounts." | "I found these accounts in the first page; more results remain." |
| Command output clipped by the runner | "No permission errors occurred." | "No permission errors appeared in the returned output; it was clipped." |
| Search hit cap with no continuation | "Only these documents match." | "The search returned a capped sample; I cannot establish the complete set." |
| Complete, timestamped query | "No active deploys matched at 14:00 UTC." | A bounded negative statement with the stated scope and time. |

This follows the broader recommendation in [Agent Evals Need Tool States, Not Just Tool Outputs](https://my-slops.github.io/Blog/posts/2026/10/agent-evals-need-tool-states-not-just-tool-outputs/): grade both the next tool action and what the agent tells the user. A system can choose not to fetch another page and still be correct, provided its claim preserves the coverage boundary.

## Steps / Code

Review every tool that can return a collection, a search result, a log excerpt, or generated text:

1. Define the claim its result can support when complete and the weaker claim it can support when partial.
2. Return a structured completeness state with the reason for any cutoff. Never rely on a label in an unstructured log line.
3. Include the query scope, sort order where material, and an `asOf` time or source revision when the result represents mutable data.
4. Return a continuation handle only when the tool can safely resume the same query. Do not ask models to reconstruct it.
5. At each adapter boundary, test that a response which was partial upstream remains partial downstream.
6. Add an eval that gives the agent a plausible-looking prefix and rejects an exhaustive or negative conclusion.
7. Where the full set is too expensive to fetch, expose a server-side aggregate or a scoped query that can answer the real question without moving an unbounded dataset through the model.

The last point is often the practical solution. If the user asks, "Are any payment exports failing?", a bounded `count_by_state` query may be safer and cheaper than handing an agent a 100,000-row log excerpt. Pagination is not a substitute for designing a query that matches the decision.

## Trade-offs

Completeness metadata adds fields to tool schemas and more branches to an agent runtime. Returning a continuation token can expose additional reading capability, so it must be scoped, expiring, and protected like other delegated state. Some endpoints cannot provide an exact count or a snapshot while data changes.

Those limitations are not a reason to collapse the result into `items: []` or `items: [...]`. Use `unknown` when completeness cannot be established. It is a more useful operational state than a false `complete` and more actionable than silently clipping the payload.

Not every task needs to drain every page. A UI preview legitimately shows the first 20 records. An investigation may intentionally inspect a recent time window. The contract should say that the result is a preview or bounded slice, and the caller should avoid making a conclusion that requires a complete universe.

## References

- GitHub Docs, [Using pagination in the REST API](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api)
- Kubernetes, [API concepts: retrieving large result sets in chunks](https://kubernetes.io/docs/reference/using-api/api-concepts/)
- This repository, [An Empty Search Result Is Not Evidence That Nothing Exists](https://my-slops.github.io/Blog/posts/2026/10/an-empty-search-result-is-not-evidence-that-nothing-exists/)
- This repository, [A Page Cursor Is Not Permission to Keep Reading](https://my-slops.github.io/Blog/posts/2026/10/a-page-cursor-is-not-permission-to-keep-reading/)
- This repository, [Agent Evals Need Tool States, Not Just Tool Outputs](https://my-slops.github.io/Blog/posts/2026/10/agent-evals-need-tool-states-not-just-tool-outputs/)

## Final Take

The visible part of a tool result is not necessarily the result. It may be a sample, a page, a byte-limited prefix, or a rendering artifact.

Put that fact in the contract. Then an agent can make useful local observations without manufacturing global certainty, and the system can decide deliberately whether the missing portion is worth reading.

## Changelog

- 2026-10-30: Initial publication on preserving truncation and completeness as tool-result state.
