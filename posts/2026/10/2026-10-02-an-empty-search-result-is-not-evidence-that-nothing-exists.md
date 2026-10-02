---
title: "An Empty Search Result Is Not Evidence That Nothing Exists"
date: "2026-10-02"
updated: "2026-10-02"
slug: "an-empty-search-result-is-not-evidence-that-nothing-exists"
description: "An empty result set describes what one query observed in one scope. Agent tools need to expose coverage, freshness, and completeness before an agent turns that observation into a negative claim."
summary: "`[]` can mean no matches, an incomplete index, a permission boundary, a truncated search, or a query against yesterday's snapshot. Make a tool state which of those it means before an agent tells a user that no record exists."
tags:
  - ai agents
  - api design
  - reliability
  - developer tooling
  - uncertainty
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/an-empty-search-result-is-not-evidence-that-nothing-exists/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

An empty search result is a fact about a query, not automatically a fact about the world. It can support a narrow statement—“this search found no matching documents in this index, with these filters, at this time”—but it rarely supports “no such document exists.”

That distinction matters when an agent turns a tool result into a user-facing answer. A bare `[]` erases whether the search was exhaustive, whether the index was current, which sources were excluded, and whether the caller had permission to see them. Return that evidence with the result. Then let an agent make a negative claim only as broad as the search it actually performed.

## Context

Imagine an employee asking an internal assistant, “Do we have a policy for reimbursing a home-office monitor?” The assistant searches a document index and receives:

```json
{ "documents": [] }
```

“No policy exists” sounds decisive. It may also be wrong in several ordinary ways:

- the policy lives in a benefits collection that the tool did not search;
- the latest document has not been indexed yet;
- the search applied the caller's regional filter, while the question did not name a region;
- the user lacks access to the HR collection; or
- the query used exact keywords and missed “ergonomic equipment allowance.”

None of these is a model hallucination. They are missing semantics in the tool result. The tool gave the model a list but not the meaning of an empty list.

This is a common failure in agent systems because models are trained to complete a question. When the only structured signal is `[]`, the convenient completion is a global negative. A careful system should make the more honest interpretation easy: *I found no evidence in the source I was able to search; that is not the same as evidence of absence.*

## Key Points

### Empty is meaningful only with a declared scope

Every query has a scope, whether the API exposes it or not. It includes at least the collection or database searched, the filters applied, the principal whose permissions were used, the query method, and a point in time.

For a relational database, even a simple `SELECT` is not a timeless observation. At PostgreSQL's default Read Committed isolation level, a `SELECT` sees data committed before that query began; a later query can see a different result. An empty result therefore means “no matching row in this query's snapshot,” not “no matching row will exist when the next request runs.”

Search systems add more ways for scope to shrink. Elasticsearch documents a default `from`/`size` result-window limit and recommends a point in time when paging needs a stable index view. A tool that scans only the first page, a subset of shards, or a lagging derived index has made a useful observation, but it has not performed an exhaustive absence check.

The language should match that reality:

| What the system knows | Wording it can support |
| --- | --- |
| A specific, exhaustive source was searched at a known revision. | “No matching policy was found in the current HR handbook.” |
| Some sources were searched, others were unavailable or excluded. | “I found no matching policy in the sources I could search.” |
| The search was broad but may be stale or incomplete. | “The index returned no match; I cannot confirm that no policy exists.” |
| The tool could not establish coverage. | “I could not verify this from the available sources.” |

The first statement is still not a proof about every document a company owns. It is useful because it names the actual authority: the current HR handbook. That is often the question the user meant anyway.

### Completeness is separate from result count

APIs often describe a search response as either successful or failed. That leaves out an important middle state: successful but incomplete.

A retrieval tool may return zero documents after doing any of the following:

- searching one index while a second configured source is temporarily unavailable;
- stopping at a latency or cost budget;
- applying a permission filter;
- querying an index that is behind the source of truth;
- using approximate retrieval with a relevance threshold; or
- receiving only the first page of a potentially larger scan.

Those choices are sometimes exactly right. An agent should not bypass authorization because a user wants a more conclusive answer, and a production search service should not scan every historical artifact for every question. The mistake is representing the outcome as the same `[]` in every case.

In particular, do not encode completeness by inferring it from a zero count. `documents.length === 0` describes the payload. It says nothing about what the service was entitled, configured, or able to inspect.

### Make negative evidence a first-class tool result

The contract does not need to be elaborate. It needs to distinguish content from coverage. This TypeScript-like sketch is illustrative; its source and permission names should match the service's actual authorization model.

```ts
type SearchResult = {
  documents: Array<{
    id: string;
    title: string;
    excerpt: string;
    source: string;
  }>;
  observation: {
    // What was actually searched, not a vague product name.
    searchedSources: string[];
    excludedSources: Array<{
      source: string;
      reason: "not_authorized" | "unavailable" | "not_selected";
    }>;
    filters: Record<string, string | string[]>;
    searchedAt: string;
    sourceVersion?: string;
    completeness: "exhaustive_in_scope" | "partial" | "best_effort" | "unknown";
  };
};
```

`exhaustive_in_scope` is deliberately narrower than `exhaustive`. It promises that the service evaluated the declared scope, not that the scope contains every relevant fact. A human has to decide what counts as authoritative; the API can make that decision inspectable.

If metadata is sensitive, do not expose raw collection names or access-control rules to the model. A bounded version is still much better than nothing:

```json
{
  "documents": [],
  "observation": {
    "searchedSources": ["eligible-policy-corpus"],
    "excludedSources": [{ "source": "restricted-corpus", "reason": "not_authorized" }],
    "searchedAt": "2026-10-02T14:05:00Z",
    "completeness": "partial"
  }
}
```

The agent does not need to know the restricted collection's contents. It only needs to know that the result cannot justify a universal negative. This follows the same principle as a structured error result: control information belongs in an explicit, bounded field, not in an optimistic interpretation of a human-readable string. See [A Tool Error Is an Instruction to Your Agent](https://my-slops.github.io/Blog/posts/2026/09/2026-09-21-a-tool-error-is-an-instruction-to-your-agent/) for the failure-path version of that design.

### The orchestrator should enforce the claim boundary

Do not rely on a prompt that says “be careful with empty results.” The runtime already has the structured evidence, so it can decide what answer mode is permitted before asking the model to compose prose. The simplified control flow below is pseudocode:

```ts
function permittedConclusion(result: SearchResult) {
  if (result.documents.length > 0) return "cite_matches";

  switch (result.observation.completeness) {
    case "exhaustive_in_scope":
      return "scoped_negative";
    case "partial":
    case "best_effort":
      return "qualified_negative";
    default:
      return "cannot_verify";
  }
}
```

The model can still help with a useful next step: rephrase the query, ask which policy regime applies, or tell the user where to check. It should not silently promote a `qualified_negative` into “there is no policy.” This division of labor is worth preserving even with a strong model because it converts a judgment the runtime can make deterministically into a policy instead of a hope.

### Test absence claims with deliberately missing coverage

Teams often test retrieval by seeding a known document and asserting that the agent finds it. Add tests for the more dangerous path: the tool returns no document for reasons that are not true absence.

```text
Given: the reimbursement policy exists only in a source the caller cannot access
When: the agent searches for monitor reimbursement
Then: the answer says it could not verify the policy, not that none exists

Given: the canonical handbook was updated after the search index's sourceVersion
When: a query returns no matching document
Then: the answer names the index as stale or asks to retry after refresh

Given: all authoritative policy sources are searched at a known revision
And: no match is returned
Then: the answer may state a scoped negative and cite that source
```

These tests are especially valuable for agents because an empty answer looks plausible in a demo. A success metric that checks only fluent prose will miss the difference between an accurate scoped conclusion and a confident claim about data the system never searched. A parseable response is not enough; the application must also know whether it has evidence for the answer it plans to show, as discussed in [A Valid JSON Response Can Still Be a Bad Answer](https://my-slops.github.io/Blog/posts/2026/09/2026-09-08-a-valid-json-response-can-still-be-a-bad-answer/).

## Steps / Code

For every tool whose empty result can influence a decision, review these questions:

1. What source or snapshot did this query actually observe?
2. Which filters, tenant boundaries, permissions, and pagination limits affected it?
3. Is the source authoritative for the question, and how fresh is it?
4. Can the tool say whether it completed its declared search scope?
5. Which negative sentence is the agent allowed to make for each completeness state?
6. When coverage is partial, can the agent offer an approved follow-up rather than inventing certainty?

Start with tools used for compliance, security, support, financial, or operational questions. Those are the places where “we have no record of that” may trigger a real action. A search interface does not need to make every query exhaustive; it needs to stop hiding the difference between *not found here* and *does not exist*.

## Trade-offs

Coverage metadata makes a tool interface more complex, and some systems genuinely cannot calculate an exact completeness claim. Vector retrieval may be approximate by design; federated search may have variable source availability; permissions can make an answer intentionally incomplete. In those systems, `best_effort` or `unknown` is not a failure of engineering. It is an honest description of the service.

There is also a user-experience cost. “I could not verify that” is less satisfying than a crisp answer. But false certainty is not a better experience when it causes a user to abandon a valid expense, close an incident, or send a duplicate request. Use a scoped negative when the evidence supports one. Ask a short follow-up or route to the authoritative owner when it does not.

Finally, a completeness field is not an authorization escape hatch. The agent should never reveal which restricted records exist merely because it knows a search was incomplete. Separate the model-visible coverage summary from protected diagnostics, and keep access enforcement outside the model context.

## References

- PostgreSQL Global Development Group, [Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- Elastic, [Paginate search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results)
- This repository, [A Tool Error Is an Instruction to Your Agent](https://my-slops.github.io/Blog/posts/2026/09/2026-09-21-a-tool-error-is-an-instruction-to-your-agent/)
- This repository, [A Valid JSON Response Can Still Be a Bad Answer](https://my-slops.github.io/Blog/posts/2026/09/2026-09-08-a-valid-json-response-can-still-be-a-bad-answer/)

## Final Take

`[]` is not a negative fact. It is a result shape.

Make a tool say what it searched, what it could not search, how fresh the observation was, and whether it completed the scope it claims to cover. Then an agent can be precise when precision is justified—and candid when it is not. That is a much more useful contract than teaching the model to sound less certain after the fact.

## Changelog

- 2026-10-02: Initial publish.
