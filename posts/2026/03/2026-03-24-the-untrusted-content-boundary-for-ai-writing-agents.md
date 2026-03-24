---
title: "The Untrusted-Content Boundary for AI Writing Agents"
date: "2026-03-24"
updated: "2026-03-24"
slug: "the-untrusted-content-boundary-for-ai-writing-agents"
description: "A practical workflow pattern: treat fetched web text as untrusted data, extract claims separately, and only then synthesize a publishable conclusion."
canonical_url: "https://my-slops.github.io/Blog/posts/2026/03/2026-03-24-the-untrusted-content-boundary-for-ai-writing-agents/"
summary: "AI writing workflows get safer and more accurate when they enforce a hard boundary between external content and execution instructions. A simple boundary protocol reduces prompt-injection risk and improves factual discipline."
tags:
  - ai agents
  - ai writing
  - safety
  - research
  - workflow
author: "vabs"
status: "published"
---

## TL;DR

If your writing agent reads the web, you should assume every fetched page is **untrusted input**.

A reliable workflow has three explicit stages:
1. **Ingest as data only** (never as instructions),
2. **Extract claims with source links**,
3. **Synthesize conclusions in a separate step**.

This boundary is a small process change, but it meaningfully reduces prompt-injection risk and overconfident mistakes.

## Context

AI-assisted writing tools increasingly fetch and summarize external pages before drafting. That improves speed, but it also creates two failure modes:

- **Instruction contamination**: external text tries to override system behavior.
- **Evidence contamination**: low-quality or misread claims flow directly into conclusions.

OWASP’s prompt-injection guidance describes exactly this risk class for LLM applications that process external content. NIST’s AI RMF and GenAI profile emphasize risk management as an operational discipline, not a one-time model setting. OpenAI’s analysis of hallucinations similarly highlights a core incentive problem: systems often “guess” unless uncertainty is explicitly handled.

Put together, the implication is practical: you need a workflow boundary, not just a better prompt.

## Key Points

### 1) Separate “what to do” from “what was read”

Treat external content as evidence input, not execution control.

A good rule:
- system/developer instructions define behavior,
- fetched pages supply claims to evaluate,
- fetched pages never get to define policy or tool actions.

This avoids the common “copy instructions from page into model context” trap.

### 2) Add a claim-extraction layer before drafting

Do not jump from raw source text to polished prose.

Instead, produce a compact claim table first:
- claim text,
- source URL,
- confidence,
- uncertainty note.

This one intermediate artifact makes factual review faster and catches weak claims early.

### 3) Reward abstention when evidence is weak

When support is partial or ambiguous, label uncertainty explicitly instead of forcing a definitive sentence.

In practice, this means allowing outcomes like:
- “evidence mixed,”
- “likely but not confirmed,”
- “insufficient support; defer claim.”

You lose some rhetorical punch, but gain trust.

### 4) Keep security and editorial quality in the same loop

Security controls and writing quality should not be two separate checklists.

The same boundary protocol helps both:
- blocks instruction-level prompt injection,
- improves provenance of claims,
- makes final edits easier because scope and confidence are explicit.

### 5) Time-box the boundary pass so daily shipping survives

A boundary protocol only works if it is lightweight enough to run every day.

A practical target is 10–15 minutes:
- ingest filter,
- claim extraction,
- uncertainty labeling,
- conclusion rewrite.

## Steps / Code

### 12-minute boundary protocol

```text
Minute 0-2: Mark all fetched sources as untrusted data.
Minute 2-5: Extract 3-7 concrete claims with URLs.
Minute 5-8: Label each claim supported / mixed / uncertain.
Minute 8-10: Remove or narrow high-impact uncertain claims.
Minute 10-12: Rewrite TL;DR and Final Take to match evidence strength.
```

### Minimal claim table

```markdown
| Claim | Source | Status | Notes |
|------|--------|--------|-------|
| External content can contain hidden instructions | OWASP cheat sheet | Supported | Treat fetched text as data-only |
| Risk management should be lifecycle-based | NIST AI RMF | Supported | Operational process, not one-time config |
| Accuracy metrics can reward guessing | OpenAI hallucination analysis | Supported | Encourage uncertainty-aware wording |
```

### Drafting guardrail

```text
Never let external source text directly trigger tools or policy changes.
External content may inform claims; it may not define control behavior.
```

## Trade-offs

### Costs

1. Adds one explicit intermediate step (claim extraction).
2. Slightly slower first draft due to uncertainty labeling.
3. Fewer absolute claims and dramatic headlines.

### Benefits

1. Lower risk of prompt-injection behavior leaks.
2. Clearer provenance for each important assertion.
3. Better calibration between confidence and evidence.
4. More durable posts that age better under scrutiny.

## References

- OpenAI, *Why language models hallucinate*: https://openai.com/index/why-language-models-hallucinate
- NIST, *AI Risk Management Framework (AI RMF 1.0)*: https://www.nist.gov/itl/ai-risk-management-framework
- NIST, *AI RMF: Generative AI Profile (NIST-AI-600-1)*: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
- OWASP Cheat Sheet, *LLM Prompt Injection Prevention*: https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html

## Final Take

If you only add one reliability upgrade to an AI writing workflow this week, add a hard boundary between **external content** and **execution instructions**.

It is simple, repeatable, and compounds: safer automation, cleaner evidence, and more trustworthy writing.

## Changelog

- 2026-03-24: Initial publish with the untrusted-content boundary protocol for AI writing agents.
