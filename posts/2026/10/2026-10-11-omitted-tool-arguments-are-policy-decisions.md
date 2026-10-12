---
title: "Omitted Tool Arguments Are Policy Decisions"
date: "2026-10-11"
updated: "2026-10-11"
slug: "omitted-tool-arguments-are-policy-decisions"
description: "An optional tool argument does not remove a decision. It moves that decision to a default, where it can silently expand an agent's scope or effect."
summary: "Treat omission as part of a tool's behavioral contract. Use conservative defaults for bounded reads; require explicit values or confirmation when omission could broaden scope, reveal more data, or trigger a write."
tags:
  - ai agents
  - api design
  - developer tooling
  - reliability
  - safety
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/omitted-tool-arguments-are-policy-decisions/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

Making a tool argument optional does not make the decision disappear. It gives the server, SDK, wrapper, or agent runtime permission to make that decision when the caller says nothing.

That can be entirely reasonable for a bounded read: an omitted `limit` can mean 25 results and an omitted `includeArchived` can mean `false`. It is much harder to justify for an argument that controls target scope, disclosure, or side effects. An omitted recipient list must not become “everyone,” an omitted workspace must not become “all workspaces,” and an omitted mode must not quietly turn a preview into an execution.

For agent tools, absence deserves the same design review as a supplied value. It is behavior, not missing syntax.

## Context

An agent receives: “Archive the duplicate invoices from last quarter.” It calls a tool with only the search query:

```json
{
  "query": "duplicate invoices from last quarter"
}
```

The schema says `workspaceId`, `selection`, and `dryRun` are optional. The service fills them in:

- `workspaceId` becomes the organization-wide workspace;
- `selection` becomes every match; and
- `dryRun` becomes `false`.

The request is perfectly valid. That is the problem.

The model did not explicitly choose a broad target or an irreversible operation, but the system still did. The choices merely moved into defaults that are easy to miss in a schema, an SDK, and a handler each owned by different people.

JSON Schema makes this distinction particularly clear. Its `default` keyword is an annotation: the specification says applications decide how to use annotations and implementations are not expected to apply them for the application. A schema can communicate a suggested default, but it cannot prove that every caller, generated client, and server resolves omission the same way. [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/draft-bhutton-json-schema-01) is explicit about that boundary.

So a tool contract needs a semantic answer, not merely an optional-property marker: *what exactly happens when this argument is absent?*

## Key Points

### Optional is a syntax property; safe is a behavioral property

An optional field means that a request without the field can pass validation. It does not say whether the resulting operation is narrow, private, cheap, reversible, or even unsurprising.

Consider these otherwise ordinary defaults:

| Omitted argument | Plausible default | Effect of the default |
| --- | --- | --- |
| `limit` on a search | `25` | Bounds cost and disclosure. |
| `includeArchived` | `false` | Avoids broadening the result set. |
| `workspaceId` | caller's current workspace | Preserves a local authorization context. |
| `recipientIds` on a send | all matching users | Broadens a side effect. |
| `dryRun` on a destructive operation | `false` | Turns an incomplete request into an execution. |
| `fields` on a customer lookup | all fields | May disclose more data than the caller needs. |

The first three are often good defaults because they reduce scope. The latter three are policy decisions that deserve either an explicit value or a confirmation mechanism.

This is why “the parameter was optional” is not a satisfying incident explanation. It only describes why the request was accepted. It does not justify the action that acceptance caused.

### Make scope and effect impossible to omit when they matter

For actions with material impact, prefer a request shape that forces the caller to state the choice. Do not overload an absent `ids` array to mean “use the query,” then allow that query to operate on an unbounded universe.

Here is illustrative TypeScript for an archive operation:

```ts
type ArchiveRequest =
  | {
      selection: { kind: "ids"; ids: readonly [string, ...string[]] };
      mode: "execute";
    }
  | {
      selection: { kind: "query"; query: string; workspaceId: string };
      mode: "preview";
    }
  | {
      selection: { kind: "query"; query: string; workspaceId: string };
      mode: "execute";
      confirmationToken: string;
    };
```

The type is not a security control by itself. The server must still authenticate the caller, check the workspace, and verify that a confirmation token describes the same resolved selection it is about to archive. But the shape makes a crucial difference: a query-based execution cannot happen because the model omitted an argument. It needs an explicit execution mode and a token tied to what the preview found.

For a read, a conservative server-side resolver is usually enough:

```ts
function resolveListOptions(input: {
  limit?: number;
  includeArchived?: boolean;
  workspaceId?: string;
}, caller: { workspaceId: string }) {
  return {
    limit: Math.min(input.limit ?? 25, 100),
    includeArchived: input.includeArchived ?? false,
    workspaceId: input.workspaceId ?? caller.workspaceId,
  };
}
```

The important feature is not the exact number 25. It is that absence narrows the request, and that the resolved values are visible to authorization and logging code rather than hidden inside a database query.

### Keep schema hints and runtime behavior in one contract

`default: false` in a schema, `arg.flag || true` in a JavaScript handler, and an SDK that serializes `undefined` differently from `null` are three different policies. A generated tool description can say one thing while production does another.

JSON Schema deliberately leaves application of annotation data to applications. That is a useful separation of concerns, but it means teams must supply the missing contract themselves. Do not assume a validator inserts defaults, that a model will copy them into a call, or that a client will preserve the difference between absent, `null`, `false`, and an empty list.

Put the rule where it can be tested:

- document the omitted-value behavior in the tool description;
- resolve defaults once at the server boundary;
- return the effective scope or preview count when it helps the caller assess impact; and
- log the resolved arguments with sensitive values redacted.

This complements [Stop Calling Tools Read-Only Before You Define Their Effects](https://my-slops.github.io/Blog/posts/2026/10/stop-calling-tools-read-only-before-you-define-their-effects/). A declared read-only operation can still expose too much if an omitted field selector means “return every field,” and a declared write can become broader than intended if an omitted target means “all matching records.”

### Test absence as a first-class input

Most request tests cover values the happy path supplies. The more revealing cases are the ones a tool caller may omit, hallucinate, or serialize oddly:

```text
Given: a caller authorized for workspace A
When: list_documents is called with no workspaceId
Then: the effective workspace is A, never every workspace

Given: a destructive query action without confirmationToken
When: mode is "execute"
Then: the request is rejected before any records are selected or changed

Given: includeArchived is omitted, false, and true
When: each request is resolved
Then: the effective values are false, false, and true

Given: includeArchived is null
When: the request is resolved
Then: it is rejected unless null has an explicitly documented meaning

Given: the API schema says default false for dryRun
When: the runtime receives no dryRun property
Then: the server's effective mode is asserted in an integration test
```

The third case is intentionally uncomfortable. `null`, omission, `false`, and `[]` should not be collapsed accidentally by a truthiness check. If the API intends them to mean the same thing, make that equivalence explicit and test it. If they mean different things, reject the ambiguous ones rather than relying on a language's coercion rules.

## Steps / Code

Review every optional tool argument with four questions:

1. What is the effective value when the argument is absent, `null`, empty, or malformed?
2. Does that value narrow scope, cost, disclosure, and authority—or broaden any of them?
3. Can an agent discover the effective value before it causes a material side effect?
4. Is the same behavior implemented by the schema, generated client, server, and audit record?

The answer need not always be “require it.” Requiring a `limit` on every search creates ceremony without much protection. Requiring an explicit `workspaceId` can also be redundant when the authenticated session has exactly one workspace.

But the fallback must be defensible. “The handler needed a value” is not a policy. “It resolves to the caller's current workspace and at most 25 non-archived records” is one.

## Trade-offs

Explicit inputs make a tool harder for both humans and models to call. A model may need a preview turn before it can obtain a confirmation token; a CLI user may need to type a workspace ID that the session already implies. For low-impact, bounded reads, that friction is not worth it.

There is also no universal conservative default. In an operations console, omitting a date range might reasonably mean the current incident window, not an arbitrary seven days. In a compliance export, it may be safer to reject a missing range entirely. The contract should reflect the product's real authorization and data model rather than a cargo-cult rule that every omitted field becomes `false`.

My preference is simple: default only where the default is less capable than a likely explicit alternative. Once omission can widen a target, reveal a richer representation, incur unusual cost, or cause an external change, make the decision visible.

## References

- JSON Schema, [Draft 2020-12 Core: annotations and application behavior](https://json-schema.org/draft/2020-12/draft-bhutton-json-schema-01)
- JSON Schema, [Draft 2020-12 Validation: `default`](https://json-schema.org/draft/2020-12/json-schema-validation#section-9.2)
- This repository, [Stop Calling Tools Read-Only Before You Define Their Effects](https://my-slops.github.io/Blog/posts/2026/10/stop-calling-tools-read-only-before-you-define-their-effects/)
- This repository, [Authorize the Next Action, Not the Whole Agent](https://my-slops.github.io/Blog/posts/2026/09/authorize-the-next-action-not-the-whole-agent/)

## Final Take

An absent argument is not an absence of policy. It is a decision delegated to code.

Make that delegation explicit, test it across real request boundaries, and keep its default narrower than the action an agent might otherwise choose. The safest tool calls are not the ones with the fewest fields. They are the ones whose omissions cannot quietly make an important decision on the caller's behalf.

## Changelog

- 2026-10-11: Initial publication.
