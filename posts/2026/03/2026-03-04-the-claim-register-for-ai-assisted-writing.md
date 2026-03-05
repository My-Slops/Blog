---
title: "The Claim Register: A 12-Minute Guardrail for AI-Assisted Writing"
date: "2026-03-04"
slug: "the-claim-register-for-ai-assisted-writing"
description: "A practical claim register workflow that keeps evidence attached to AI-generated drafts, reducing citation drift and overconfident claims before publishing."
summary: "Use a lightweight claim register while drafting to track claim type, confidence, and proof requirements. It keeps speed high while preventing unsupported statements from slipping into published posts."
tags:
  - ai writing
  - blogging
  - editing
  - research
  - credibility
author: "vabs"
status: "ready"
---

## TL;DR

If you draft with AI, your biggest quality risk is not grammar—it’s **citation drift** (claims losing evidence as the draft evolves).

A simple fix is a “claim register”: a small table that tracks each material claim, its confidence level, and required proof before publish. It adds ~12 minutes and catches most credibility errors.

## Context

Yesterday’s evidence ladder solves one problem: matching claim impact to proof strength.

But there’s a second failure mode in real workflows: even when you start with sources, claims get rewritten, merged, or generalized during editing. By final draft, references may no longer support the exact sentence.

That is citation drift. It quietly erodes trust.

A claim register prevents this by treating claims like versioned artifacts, not loose prose.

## Key Points

### 1) Separate “writing flow” from “truth tracking”

Trying to fact-check every sentence while drafting kills momentum.

Instead:
- Draft in flow mode.
- Run a short truth-tracking pass with a claim register.

This preserves speed while improving reliability.

### 2) Use a claim register with five fields

For each non-trivial claim, track:
1. **Claim text** (exact sentence or paraphrase)
2. **Type** (fact / inference / recommendation)
3. **Evidence requirement** (based on your evidence ladder level)
4. **Source(s)** (URLs, notes, dataset, personal log)
5. **Publish status** (keep / soften / remove)

Non-obvious benefit: this creates an audit trail for future updates, so revising old posts becomes much faster.

### 3) Add a “drift check” after line edits

After your final line edit, sample-check high-impact claims:
- Does this exact sentence still match the source?
- Did quantifiers change ("some" → "most")?
- Did scope change ("in this context" → universal statement)?

Most credibility bugs appear in these tiny wording shifts.

### 4) Treat unsupported claims as product bugs, not style issues

If a claim cannot meet required evidence:
- downgrade confidence,
- narrow scope,
- or delete it.

The right move is not to write around uncertainty, but to expose it clearly.

### 5) Keep one reusable register template per post

Over time, this becomes part of your editorial infrastructure:
- faster reviews,
- easier collaboration,
- cleaner handoffs to future-you.

In practice, reliability compounds more than raw writing speed.

## Steps / Code

### 12-minute claim register pass

```text
Minute 0-2   Mark non-trivial claims in the draft
Minute 2-5   Fill register rows (claim, type, evidence, source, status)
Minute 5-8   Verify level 3-5 claims against sources
Minute 8-10  Soften or remove unsupported claims
Minute 10-12 Run drift check after final wording edits
```

### Copy/paste register template

```md
## Claim Register

| # | Claim | Type | Evidence level | Source(s) | Status |
|---|-------|------|----------------|-----------|--------|
| 1 |       |      |                |           | Keep / Soften / Remove |
```

### Example row

```md
| 3 | Specific examples improve comprehension in practical guides | Inference | 3 | https://www.nngroup.com/articles/how-users-read-on-the-web/ | Keep (scope: web usability context) |
```

## Trade-offs

**Costs**
- Adds an explicit pre-publish QA step.
- Feels bureaucratic at first.
- Requires discipline when deadlines are tight.

**Benefits**
- Fewer unsupported statements.
- Better long-term reader trust.
- Easier updates when sources change.
- Clear distinction between evidence and opinion.

## References

- Google Search Central, *Creating helpful, reliable, people-first content*: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Nielsen Norman Group, *How Users Read on the Web*: https://www.nngroup.com/articles/how-users-read-on-the-web/
- UK Government, *The Aqua Book: guidance on producing quality analysis for government*: https://www.gov.uk/government/publications/the-aqua-book-guidance-on-producing-quality-analysis-for-government

## Final Take

For AI-assisted writing, quality is mostly a systems problem.

A claim register is a small system upgrade with outsized returns: you keep drafting speed, but stop shipping confidence that your evidence can’t carry.

## Changelog

- 2026-03-04: Initial version drafted with claim register workflow and drift-check pass.
