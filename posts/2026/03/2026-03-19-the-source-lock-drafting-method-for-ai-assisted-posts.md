---
title: "The Source-Lock Drafting Method for AI-Assisted Posts"
date: "2026-03-19"
updated: "2026-03-19"
slug: "the-source-lock-drafting-method-for-ai-assisted-posts"
description: "A practical workflow that forces source selection before drafting, so claims are shaped by evidence instead of retrofitted citations."
canonical_url: "https://my-slops.github.io/Blog/posts/2026/03/2026-03-19-the-source-lock-drafting-method-for-ai-assisted-posts/"
summary: "If you choose sources after drafting, you usually end up defending your first draft instead of testing it. Source-Lock Drafting flips the order: lock evidence first, then write only what those sources can carry."
tags:
  - ai writing
  - editorial workflow
  - verification
  - research
  - blogging
author: "vabs"
status: "ready"
---

## TL;DR

Most AI-assisted drafts fail in a predictable way: the model generates smooth claims first, and the writer hunts for citations later. That sequence encourages overclaiming.

**Source-Lock Drafting** reverses the order:
1. pick 2–4 credible sources first,
2. extract only claim-worthy notes from them,
3. draft only inside that evidence boundary,
4. mark anything outside the boundary as hypothesis.

This keeps speed high while making posts more defensible and easier to update.

## Context

In yesterday’s workflow, I used a claim-trace table to verify claims before publishing. That catches problems late. Today’s improvement shifts quality earlier: constrain the draft before prose hardens.

Why this matters:
- NIST’s AI RMF frames trustworthy AI work as a risk-management discipline across design, development, and use—not a last-minute patch.
- Google’s people-first content guidance asks for clear sourcing, original value, and factual reliability.
- Hallucination research on references shows language models can produce plausible but fabricated citations, so citation-like text is not enough.

The practical implication: **verification should begin at ideation, not only at final QA.**

## Key Points

### 1) Sequence is the hidden quality lever

When drafting starts before source selection, writers tend to protect first-pass phrasing and retrofit evidence. Source-Lock removes that bias by forcing the evidence envelope first.

### 2) Use a fixed evidence budget

Pick a small, explicit source set (usually 2–4 links):
- one standards/official source,
- one platform/operator source,
- one research source (if needed),
- optional practical example.

If a claim cannot be grounded in this set, either cut it or label it as hypothesis.

### 3) Draft from extracted claims, not full articles

For each source, capture 2–3 notes in this format:
- claim,
- source URL,
- confidence wording,
- limitation/scope.

This turns drafting into assembly from verified building blocks.

### 4) Add a “boundary sentence” in the post

State what the post does **not** claim. This is low effort and reduces reader misinterpretation.

Example: “This method improves factual reliability for short-form technical posts; it does not replace domain-expert review for high-stakes topics.”

### 5) Keep uncertainty explicit

Use calibrated language tied to evidence strength:
- strong: “shows,” “documents,”
- moderate: “suggests,” “indicates,”
- weak: “anecdotally,” “hypothesis.”

This preserves trust without pretending certainty.

## Steps / Code

### 15-minute Source-Lock pass

```text
Minute 0-3: Pick topic + define one core question
Minute 3-6: Select 2-4 credible sources and open them
Minute 6-10: Extract 5-8 claim notes (claim + URL + scope)
Minute 10-13: Group notes into sections (TL;DR, key points)
Minute 13-15: Start drafting only from extracted notes
```

### Minimal note template

```markdown
| Claim note | Source | Confidence | Scope limit |
|---|---|---|---|
| NIST AI RMF is voluntary and focused on trustworthiness integration across AI lifecycle. | https://www.nist.gov/itl/ai-risk-management-framework | High | Framework-level guidance, not implementation guarantee |
| Google asks for clear sourcing and substantial original value in people-first content. | https://developers.google.com/search/docs/fundamentals/creating-helpful-content | High | Search guidance, not universal editorial law |
| LMs can output hallucinated references that look plausible. | https://arxiv.org/abs/2305.18248 | Medium-High | Study focuses on reference hallucinations |
```

### Ship rule

```text
No source-lock, no publish:
If major claims are not pre-grounded, downgrade scope or delay publication.
```

## Trade-offs

### Costs

1. Slightly slower start (about 10–15 minutes).
2. Fewer speculative claims in the first draft.
3. Requires discipline to avoid adding unsourced “one more insight.”

### Benefits

1. Lower factual drift during drafting.
2. Faster final QA because claim support already exists.
3. Cleaner updates and changelogs when sources evolve.
4. More reader trust via explicit confidence and boundaries.

## References

- NIST, *AI Risk Management Framework (AI RMF 1.0)*: https://www.nist.gov/itl/ai-risk-management-framework
- Google Search Central, *Creating Helpful, Reliable, People-First Content*: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Dziri et al., *Do Language Models Know When They’re Hallucinating References?* (arXiv:2305.18248): https://arxiv.org/abs/2305.18248

## Final Take

If you want daily publishing speed without credibility debt, change the sequence.

Don’t draft then justify. **Source-lock first, then write.**

That one shift makes AI-assisted writing noticeably more reliable without turning your workflow into bureaucracy.

## Changelog

- 2026-03-19: Initial publish with Source-Lock Drafting workflow and templates.
