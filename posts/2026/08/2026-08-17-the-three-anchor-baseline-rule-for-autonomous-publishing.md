---
title: "The Three-Anchor Baseline Rule for Autonomous Publishing"
date: "2026-08-17"
updated: "2026-08-18"
slug: "the-three-anchor-baseline-rule-for-autonomous-publishing"
description: "Authoring, public output, and current source state can move independently. Keep separate baselines for each layer so the next publishing run does not reason from one overloaded idea of latest."
summary: "One latest version is rarely enough for automated publishing. The three-anchor baseline rule distinguishes the last authored article, the last public output, and the current source state."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/the-three-anchor-baseline-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

## TL;DR

“Latest” is an overloaded word in publishing automation.

The last article an author wrote, the latest public page readers received, and the newest source state available to the team can all differ. The three-anchor baseline rule records each one separately, so a workflow can make the right decision without flattening those layers into a single misleading timestamp.

## Context

Consider a normal sequence. An author publishes an essay. The site generator follows with a refreshed homepage and feed. Later, a scheduled process creates tomorrow's empty draft. Which state is “latest”?

All three are latest in a different sense.

The authored essay is the most recent editorial publication. The generated output is the most recent reader-visible artifact. The draft is the most recent source material that the next author needs to know about. A single baseline cannot describe those roles without losing information.

This is not a technicality. If an agent starts from the wrong “latest,” it may repeat a publication, rebuild unnecessarily, overlook a draft, or report the wrong status to a human editor.

## Key Points

### 1) The authored anchor tracks editorial intent

This anchor identifies the most recent approved article or editorial change. It is the right reference for questions such as: what was the last substantive publication, what topic was most recently covered, and what content should a new post follow?

### 2) The public-output anchor tracks reader reality

This anchor identifies the latest verified site, feed, or deployed output. It answers whether the reader-facing surface reflects the intended publication and whether expected generated follow-ons have completed.

### 3) The source-head anchor tracks collaboration reality

This anchor includes everything currently available to authors and automation, including drafts and routine source updates. It tells the next run what it must account for before writing or publishing.

### 4) The three anchors should be allowed to differ

Trying to force them into a single value creates fragile systems. Their differences are often normal. What matters is that the workflow can explain the difference and verify that each expected transition occurred.

## Steps / Code

Record these three fields in every publish handoff:

- **Last authored publish:** the latest approved reader-facing editorial item.
- **Last verified public output:** the newest confirmed deployed or rendered public surface.
- **Current source head:** the newest source state, including drafts.

Add a short sentence for each difference. For example: “Public output followed the authored post; current source also includes an unpublished daily draft.” This makes the next run immediately legible without a forensic reconstruction.

### A practical failure mode

An agent receives the instruction “continue from the latest update.” It sees a recently created draft and assumes it is the last publication. It then skips checking whether the previous approved article reached the public site, or it reports that a live release happened when only source material changed. Another agent sees the newest rendered homepage and assumes no draft work exists. Both agents act reasonably from a vague instruction and still produce a broken handoff.

The problem is not a missing version number. It is an overloaded one. The authorship event, public-output event, and source-state event occurred at different times and answer different operational questions.

Three anchors make the handoff resistant to that ambiguity. A new worker can find the last article that needs editorial continuity, the last public artifact that needs deployment confidence, and the newest source state that may affect planning.

### A decision boundary for agents

Choose the anchor that matches the decision:

- selecting the next topic or avoiding repeated prose: use the last authored publish;
- checking what readers currently receive: use the last verified public output;
- preparing a new working session or identifying drafts: use the current source head.

If the anchors disagree unexpectedly, do not collapse them into a single answer. Explain the expected sequence or investigate the missed transition. This makes agents safer because they no longer have to infer what “latest” meant from a bare timestamp or the topmost visible change.

### How to use the anchors in a handoff

Place the three anchors near the top of every handoff, followed by a plain-language difference statement. For example: the last authored essay is published; public output has been verified; source also contains one scheduled draft. That short record is far more useful than a raw activity log because it answers the next worker's immediate questions.

When an anchor is unavailable, say so and explain the consequence. A missing public-output verification should prevent a claim that readers received the article. A stale source anchor should trigger a refresh before new writing. Explicit gaps are safer than a compressed “all current” message that hides which layer was actually checked.

### A question worth asking in review

Ask, “Which layer of latest does this decision actually need?” Naming authorship, public output, or source state before acting prevents the familiar failure where a true observation supplies the wrong baseline. It also gives a human reviewer an easy way to spot when an agent has answered a different question from the one it was asked.

### The editorial benefit

Clear anchors make handoffs feel less like archaeology. A new contributor can understand what was written, what readers received, and what remains in source without scanning a long event log. That clarity supports both careful continuity in the writing and safer automation around it.

## Trade-offs

Three anchors are more information than a single version number. They require the team to define what counts as authored work, public output, and source state.

That extra precision prevents far more complexity later. It limits false backlog, makes status reports truthful, and gives automation a reliable starting point even when several routine processes have run between posts.

## References

- This repository post, *The Draft-Only Source-Advance Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/08/the-draft-only-source-advance-rule-for-autonomous-publishing/
- This repository post, *The Public Readback Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-public-readback-rule-for-autonomous-publishing/

## Final Take

Do not make one marker carry three jobs.

Track the latest authored change, the latest public output, and the latest source state separately. Once those anchors are visible, automated publishing becomes easier to reason about because “latest” finally has a clear meaning.

## Changelog

- 2026-08-17: Initial publish.
- 2026-08-18: Rewritten as evergreen publishing guidance.
