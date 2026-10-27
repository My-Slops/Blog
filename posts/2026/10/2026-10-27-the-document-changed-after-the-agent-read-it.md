---
title: "The Document Changed After the Agent Read It"
date: "2026-10-27"
updated: "2026-10-27"
slug: "the-document-changed-after-the-agent-read-it"
description: "A URL and source ID tell an agent where evidence came from, not which version it used. Decisions and citations need enough representation identity to be reproduced after the source changes."
summary: "Keep the human-readable source link, but attach a revision, validator, or content digest plus retrieval time when an agent's answer or action depends on mutable evidence."
tags: [ai agents, api design, reliability, developer tooling, verification]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/the-document-changed-after-the-agent-read-it/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

An agent can cite a policy URL correctly and still leave no way to determine which policy it read. The page may be edited in place, the search index may refresh, or a repository branch may advance between the answer and the audit.

For consequential answers and actions, store two things separately: a durable locator for people to open, and an identity for the representation the system actually used. That identity can be a provider revision, Git commit and path, a strong HTTP validator, or a content digest. Pair it with retrieval time and the source scope. A URL alone is a destination, not evidence provenance.

## Context

An internal assistant approves a reimbursement because it retrieves this policy:

```json
{
  "sourceId": "benefits-handbook",
  "url": "https://intranet.example/policies/benefits",
  "excerpt": "Employees may claim up to $500 for ergonomic equipment."
}
```

Three weeks later, Finance changes the policy to require manager approval. A reviewer asks why the assistant approved a $450 monitor. The stored URL now displays the new rule. The assistant's citation is not fabricated, but the system cannot show the evidence that was available when it acted.

That is not merely an audit inconvenience. It makes several ordinary engineering tasks ambiguous:

- Was the original decision wrong, or was it correct under a superseded policy?
- Did a retrieval deployment begin returning a different document under the same source ID?
- Should old decisions be re-evaluated after a change, and which ones?
- Does a citation in an agent response still support its sentence when a user opens it later?

The problem is easy to miss because URLs and record IDs are useful. They answer *where did this come from?* They usually do not answer *what exact representation did the agent see?*

HTTP makes the distinction explicit. A resource can have different selected representations over time or through content negotiation, and an `ETag` is a validator for the selected representation rather than an enduring name for the resource. [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html) describes entity tags as opaque validators used to distinguish representations. The URI and the representation are related, but they are not interchangeable.

## Key Points

### A citation needs a locator and a witness

Keep the human-readable link. It is useful for a reviewer, a user, and a correction workflow. But give an agent decision a second identifier that names or verifies the evidence it consumed.

```ts
type Evidence = {
  sourceId: string;             // Durable product-level identity
  locator: string;              // Where a human can go now
  retrievedAt: string;          // When this observation was made
  representation: {
    kind: "git_commit" | "provider_revision" | "http_etag" | "content_digest";
    value: string;
    algorithm?: "sha-256";
  };
  excerpt: string;
};
```

The exact schema is not the point. The split is. `locator` lets a human navigate. `representation` lets the system establish what it was relying on at a particular time.

For a Git-backed handbook, `commit + path` is usually a better witness than the default-branch URL. For a document platform, use its immutable revision ID if it exposes one. For a service that supplies a reliable strong `ETag`, record that validator with the request context. When no native revision exists, retain an access-controlled snapshot or a digest of the retrieved normalized bytes.

Do not call every string named `version` evidence identity. A deployment version, document `updated_at`, or search-index generation may be useful context, but it is only sufficient if it identifies the representation your decision actually used. A timestamp can collide, be truncated, or describe an upstream source while the retrieval layer served an older copy.

### Hashes establish sameness, not meaning or permission

A content digest gives a precise answer to a narrow question: are these bytes the same as the bytes previously observed? It does not prove that the document was authoritative, that the agent interpreted it correctly, or that a reviewer may access a stored copy.

That boundary is valuable. [RFC 9530](https://www.rfc-editor.org/rfc/rfc9530.html) defines `Content-Digest` for HTTP message content and `Repr-Digest` for representation data. It also notes that digest fields alone do not provide general protection against malicious message tampering; an attacker can substitute content and a new digest unless another mechanism protects the relationship. A digest is therefore a strong *comparison handle*, not a standalone trust decision.

The same warning applies to a Git object ID. It can pinpoint a file's contents in a repository history, but it does not certify that the branch was trusted, that the file was approved for this policy domain, or that the agent should have been allowed to read the file. Identity, provenance, authorization, and semantic relevance are separate checks.

Do not fix mutable citations by retaining every full document in a general-purpose trace store. That can turn a reproducibility feature into a data-retention breach. The audit record needs enough evidence to answer the relevant dispute, subject to the source's classification and retention policy.

### Preserve the retrieval boundary, not only the document

The document identity alone can still be incomplete. A policy assistant often receives an excerpt generated by a search service, and the answer may depend on rank, filters, chunk boundaries, and tenant-specific access rules.

For a decision that needs to be reproduced, record the small set of facts that could change its evidence:

| Evidence field | What it resolves later |
| --- | --- |
| Source and representation identity | Which document revision supplied the text? |
| Retrieval time | What was known at the decision boundary? |
| Query or task identity | What was the system trying to establish? |
| Authorized scope | Which corpus and policy-filtered view were eligible? |
| Excerpt or byte range | Which part of the representation supported the claim? |
| Retrieval/index configuration revision, when material | Did a rollout alter source selection or chunking? |

This is not a request to log raw prompts and entire private corpora. The scope record can be deliberately bounded: a corpus label, a policy version, a search configuration ID, and an opaque authorized-scope handle may be enough. The goal is to distinguish “the system read version 42 of this policy” from “the system found something at this URL once.”

That precision matters especially for absence claims. [An Empty Search Result Is Not Evidence That Nothing Exists](https://my-slops.github.io/Blog/posts/2026/10/an-empty-search-result-is-not-evidence-that-nothing-exists/) explains why a zero-result response needs coverage and freshness semantics. Positive evidence has the symmetric problem: a source ID without a representation identity cannot say what positive material the agent actually saw.

### Re-evaluate by changed evidence, not by guesswork

Representation identity makes policy changes actionable. Suppose each agent decision records the document revision it used. When the policy changes, a system can identify decisions based on the old revision and choose a proportionate response:

- no action for a formatting-only edit;
- notify an owner for decisions still pending;
- re-run advice that will be shown again; or
- investigate already-completed actions that the changed rule may affect.

Without that connection, teams tend to choose between two bad options: ignore a change because the old evidence is not known, or re-run every historical answer because the source URL changed. Neither is a reliable change-management policy.

There is an important limit: a new revision does not automatically invalidate every earlier decision. A policy can change prospectively, and a software documentation edit may clarify behavior without changing it. The system needs a domain owner to classify material changes. Evidence identity makes the blast radius visible; it does not decide the business rule.

### Make the action receipt cite the evidence it consumed

For a system that performs an external action, keep the evidence record with the operation receipt rather than only with a conversational transcript.

```json
{
  "operationId": "expense-approval-7f91",
  "result": "approved",
  "evidence": [{
    "sourceId": "benefits-handbook",
    "locator": "https://intranet.example/policies/benefits",
    "retrievedAt": "2026-10-27T14:03:12Z",
    "representation": {
      "kind": "provider_revision",
      "value": "rev_2026_10_12_04"
    },
    "excerptRange": { "start": 1840, "end": 1917 }
  }]
}
```

The operation receipt should still identify the actor, authorization decision, inputs, effect status, and idempotency identity where applicable. Evidence provenance is one component of an honest receipt, not a replacement for the rest. [Starting a Job Is Not the Same as Finishing It](https://my-slops.github.io/Blog/posts/2026/10/starting-a-job-is-not-the-same-as-finishing-it/) makes the analogous point for external effects: acceptance of work and proof of its outcome need different states.

For lower-risk chat answers, the same design can be lighter. Keep the visible URL and an internal retrieval event ID that resolves to the source revision while retention permits. Do not make a model generate revision IDs from memory, and do not ask it to infer whether two source labels represent the same content. The retrieval service has the bytes and metadata; it should attach the witness deterministically.

## Steps / Code

Review a retrieval-backed answer or action with these questions:

1. Can a reviewer retrieve the exact representation used, or at least verify a retained copy against the recorded identity?
2. Is the human-facing locator kept separate from the representation identity?
3. Does the record say when the system observed the evidence and under what source scope?
4. If the evidence is mutable, can a material revision identify decisions that relied on its earlier form?
5. Does retention respect the data classification, deletion promise, and access policy of the source?
6. Can an eval swap a document revision at the same URL and verify that the agent's citation, decision receipt, and re-evaluation path behave as designed?

Start with high-impact decisions: approvals, customer commitments, security guidance, compliance answers, and automated changes. A draft-writing assistant may only need a plain source link. An agent that denies an employee benefit or changes a production setting needs a stronger answer to “based on what, exactly?”

## Trade-offs

Versioned evidence costs storage, index plumbing, and schema discipline. Some upstream sources do not expose revisions. Snapshots can be expensive or legally inappropriate to retain, while an `ETag` may be weak, short-lived, or unavailable. Do not promise perfect historical replay when the source contract cannot support it.

There is also a useful middle ground. Record the retrieval time, source locator, provider revision if available, and a bounded excerpt first. Add a digest or stored snapshot only where the decision's risk and retention policy justify it. The requirement is not archival maximalism. It is an explicit statement of what evidence can be reconstructed later.

Finally, reproducibility is not a license to replay an old decision automatically. Current authorization, current facts, and current policy may all differ. The old evidence tells you why the prior system behaved as it did. A new action needs its own fresh evidence and access decision.

## References

- IETF, [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- IETF, [RFC 9530: Digest Fields](https://www.rfc-editor.org/rfc/rfc9530.html)
- This repository, [An Empty Search Result Is Not Evidence That Nothing Exists](https://my-slops.github.io/Blog/posts/2026/10/an-empty-search-result-is-not-evidence-that-nothing-exists/)
- This repository, [Starting a Job Is Not the Same as Finishing It](https://my-slops.github.io/Blog/posts/2026/10/starting-a-job-is-not-the-same-as-finishing-it/)

## Final Take

An agent does not need to preserve every document forever. It does need to stop treating a mutable link as a complete account of its evidence.

Keep the link for humans. Keep a representation identity for systems. When an answer or action matters, record when that evidence was observed and under what retrieval scope. Then “the document changed” becomes an investigable change, not a hole in the system's memory.

## Changelog

- 2026-10-27: Initial publication on evidence identity for retrieval-backed agent decisions.
