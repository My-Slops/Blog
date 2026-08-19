---
title: "The Authority-Scoped Convergence Rule for Autonomous Publishing"
date: "2026-08-05"
updated: "2026-08-18"
slug: "the-authority-scoped-convergence-rule-for-autonomous-publishing"
description: "A candidate can match one copy of a site while still lagging the source that is authorized to publish. Convergence is meaningful only when the authority being matched is named."
summary: "There is no such thing as globally converged publishing state. The authority-scoped convergence rule requires every claim of alignment to name the source that grants release permission."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/the-authority-scoped-convergence-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

## TL;DR

“Converged” is incomplete language.

A preview, cache, backup, or branch can match a familiar copy of the site and still be behind the source that is actually allowed to publish. Every convergence claim should name both sides of the relationship and identify which one has editorial authority.

## Context

Modern publishing systems have many plausible versions of truth: a production site, a repository, a CMS draft, a search index, an offline cache, and a collaborator's local copy. Most of the time they agree. When they do not, it is easy to compare the two that happen to match and declare success.

That is comforting, but not necessarily useful.

Suppose a preview matches last night's production site, while the approved editorial source contains a correction queued for publication. The preview is converged with production. It is not converged with the current editorial authority. Publishing it would reintroduce an already-resolved delay.

The rule does not say that secondary comparisons are worthless. It says they must not quietly become release permission.

## Key Points

### 1) Convergence is a relationship, not a state

An artifact is never simply “converged.” It is converged with a specified other artifact under a specified measure: identical content, matching public pages, or aligned source revisions. Naming that relationship prevents vague confidence from leaking into a publish decision.

### 2) Authority is an editorial role

Choose the authoritative source because of its role in the workflow, not because it produces the easiest comparison. It may be the reviewed mainline, the latest approved CMS revision, or a signed release manifest. Once chosen, it is the source against which release candidates must be judged.

### 3) Secondary alignment is valuable diagnostic evidence

If a cache, backup, or replica matches an older public snapshot, that tells you something useful about replication health. Record it. It can explain why a system looks reasonable to one observer and stale to another.

Just do not turn that observation into a reason to replace the current authority.

### 4) Publish receipts should name the authority

A good receipt says more than “the site was aligned.” It identifies the approved baseline, the candidate evaluated, the relationship between them, and the decision taken. That makes later review straightforward: the system can show why it trusted one source over another.

## Steps / Code

Use this sentence template in a release check:

> Candidate **X** matches **Y** on the publish surface. **Y** is or is not the current editorial authority. Therefore candidate **X** is eligible, diagnostic only, or blocked pending review.

This tiny discipline makes hidden assumptions visible. It also gives agents a compact rule they can apply without treating every locally visible copy as interchangeable.

### A practical failure mode

Suppose a writer updates a story in the CMS, while a static export and an older staging copy still agree with each other. An agent compares the staging copy to the export, finds no difference, and reports that the system is converged. That statement is locally true and editorially useless: both compared systems are behind the approved CMS version.

The resulting release is not a dramatic corruption. It is worse in a quieter way: it republishes an older account while the workflow's own report says everything matched. Readers may never know a correction existed, and the team has to reconstruct why a green comparison produced stale output.

The authority-scoped rule prevents this by asking the authority question before the comparison question. The comparison does not choose the winner; the workflow role does. Once the approved source is named, every other alignment becomes either confirmation, diagnostic evidence, or a discrepancy to investigate.

### A decision boundary for agents

Before an agent may label anything ready, its release record should answer:

- Which source has authority to approve reader-visible content?
- Which candidate is being evaluated?
- What public properties were compared?
- Does the candidate match that authority, not merely another available copy?
- If not, is the mismatch an intentional draft, an operational delay, or an unknown state?

If the first answer is missing, the agent should not publish. This is a productive block: it asks a human to define a policy rather than letting incidental accessibility decide what readers receive.

### How to make authority durable

Authority should be easy to find and difficult to replace by accident. Put it in the publishing policy, the release receipt, and the handoff information an agent receives. State who can approve a change, which source carries that approval, and what evidence is needed before a different source can take over.

This does not mean one system must control every creative decision. A team can accept drafts from many sources and can use several replicas for resilience. The final release question simply needs one clearly elected answer. If authority changes—for example, during a planned migration—record the transition explicitly and preserve the previous authority as historical context rather than allowing both to compete indefinitely.

That clarity is especially valuable when an agent has partial context. Instead of looking for the comparison that yields a convenient match, it can follow a declared chain of trust and report the precise point where evidence is missing.

### A question worth asking in review

During review, ask a deliberately awkward question: if this candidate matches perfectly, what could it still be missing? The answer forces the team to name the comparison source and the publication authority. If both are the same, the result is reassuring. If they differ, the review has found a policy decision before it becomes a stale release.

## Trade-offs

Naming authority adds process. Teams must decide which source wins when systems disagree, and that decision may expose ambiguities they would rather postpone.

The payoff is clarity. A release cannot be justified by a convenient comparison alone, and diagnostics remain useful without becoming a shortcut around editorial review.

## References

- This repository post, *The Publish-Target Binding Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-publish-target-binding-rule-for-autonomous-publishing/
- This repository post, *The Remote-Baseline Rebuild Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-remote-baseline-rebuild-rule-for-autonomous-publishing/

## Final Take

Do not ask whether a candidate is converged.

Ask: **converged with which source, and is that source allowed to decide what readers see?** Once those answers are explicit, most false-confidence releases disappear.

## Changelog

- 2026-08-05: Initial publish.
- 2026-08-18: Rewritten as evergreen publishing guidance.
