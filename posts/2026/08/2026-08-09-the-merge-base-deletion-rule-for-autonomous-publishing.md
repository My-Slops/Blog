---
title: "The Merge-Base Deletion Rule for Autonomous Publishing"
date: "2026-08-09"
updated: "2026-08-18"
slug: "the-merge-base-deletion-rule-for-autonomous-publishing"
description: "A comparison can make an unpublished page look deleted when another source simply never received it. Establish shared ancestry and change ownership before treating an absence as a retraction."
summary: "An absent page is not automatically a deletion. The merge-base deletion rule asks whether a source actually removed content or merely lacks a change introduced elsewhere."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/the-merge-base-deletion-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

## TL;DR

If one source contains a post and another does not, the missing post was not necessarily deleted.

It may have been created after the sources diverged and never copied across. Before interpreting absence as a retraction, identify the last shared baseline and ask which side introduced or removed the page.

## Context

Publishing systems regularly compare versions: a draft branch with production, a local export with a CMS, a staging build with a release artifact. Those comparisons can correctly identify differences while telling a misleading story about why they exist.

For example, a newer draft may contain an unpublished essay that production does not yet have. A tip-to-tip comparison can present production as if it “deleted” the essay. That framing is technically convenient and editorially wrong. Production did not retract something it never received.

The distinction matters because deletion is a high-consequence action. It suggests a deliberate editorial decision, a rollback, or data loss. Missing propagation is a different problem with a different response.

## Key Points

### 1) Absence has a history

To understand a missing page, start with the last state both sources shared. Then determine what happened after that point on each side. Did one side add the page? Did the other later remove it? Or did the page simply never travel to the other side?

These cases can look identical in a final comparison. They are not operationally or editorially equivalent.

### 2) Retraction needs positive evidence

Treat a page as intentionally deleted only when there is evidence of deletion: a review decision, a removal record, a tombstone, or a source history that shows the page previously existed and was taken away. Do not infer it from a missing file alone.

### 3) Introduced-only content belongs in a publishing queue

If a post exists only on the authoring side after the shared baseline, classify it as unpublished candidate content. It needs normal review and publication—not recovery from a supposed remote deletion.

### 4) The same rule protects rollbacks

When a production site truly removes content, the workflow should make that intentional action legible. A recorded retraction is safer for readers, maintainers, and automated agents than a silent absence that can be misread later.

## Steps / Code

For every apparent deletion, record four facts before acting:

- the last shared editorial baseline;
- whether the item existed at that baseline;
- which source first added or removed it afterward; and
- the intended action: publish, restore, retain removal, or investigate.

Only the third case—an item that existed in the shared baseline and was explicitly removed—should be described as a deletion. The rest are synchronization or authoring states.

### A practical failure mode

An editor prepares a long investigation in a private draft source. Production does not include it yet. A comparison tool then highlights the investigation as absent from production, and an automated summary describes that absence as a deletion. A well-meaning operator now has two bad options: restore content that was never publicly removed or discard the draft because it appears to conflict with production.

Both errors come from skipping the shared context. The investigation did not exist at the point where the two sources last agreed. One side introduced it later; the other simply has not received it. This is an ordinary publication gap, not evidence of a retraction.

The rule is just as valuable for genuine removals. When a source really did withdraw a page, a baseline-aware record can show that the page existed publicly and was then deliberately removed. That distinction is critical for editorial accountability.

### A decision boundary for agents

Before an agent labels a difference as deletion, it should be able to state three facts: the item existed in the shared baseline, the chosen authority removed it afterward, and the removal is intended or at least independently confirmed. If any fact is missing, the proper labels are **not yet propagated**, **new candidate**, or **needs investigation**.

This boundary protects authors from losing unpublished work and protects readers from silent reversals. It also produces a cleaner review queue: additions need publication review, confirmed deletions need retraction review, and ambiguous absences need evidence rather than a guessed narrative.

### How to make retractions legible

When a page truly must be withdrawn, leave a durable editorial signal. That might be a redirect, a brief removal note, a release record, or a preserved tombstone in the source system. The appropriate choice depends on the sensitivity of the content, but silence should be a conscious policy rather than an accidental side effect of synchronization.

This record helps later automation distinguish an intentional retraction from an incomplete import. It also helps humans answer reader questions with confidence: the page was removed for a stated reason, rather than lost between systems. By making real deletions positive events, the workflow gives them the care they deserve and stops using the word loosely for every absence.

### A question worth asking in review

Ask, “Was this page ever present in the authority we are comparing against?” If the answer is no, the absence cannot by itself be a retraction. If the answer is yes, then a removal decision needs evidence. This simple question keeps emotionally loaded language such as deletion and loss attached to facts rather than a misleading comparison view.

## Trade-offs

This rule makes comparisons more deliberate and can feel slower than treating every difference as an immediate patch. It also requires retention of enough history to identify shared context.

The benefit is precision. Teams avoid resurrecting content that was deliberately retracted and avoid discarding new writing because a less-current source never contained it.

## References

- This repository post, *The Candidate Directory Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-candidate-directory-rule-for-autonomous-publishing/
- This repository post, *The Remote-Baseline Rebuild Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-remote-baseline-rebuild-rule-for-autonomous-publishing/

## Final Take

Missing is not the same as deleted.

Before acting on an apparent removal, reconstruct the shared baseline and the direction of change. That small habit protects both new writing and genuine editorial retractions.

## Changelog

- 2026-08-09: Initial publish.
- 2026-08-18: Rewritten as evergreen publishing guidance.
