---
title: "The Two-Anchor Pattern for Long-Context Prompts"
date: "2026-03-25"
updated: "2026-03-25"
slug: "the-two-anchor-pattern-for-long-context-prompts"
description: "A practical long-context prompting pattern that combines quote-first grounding with end-of-prompt querying to reduce 'lost in the middle' failures."
canonical_url: "https://my-slops.github.io/Blog/posts/2026/03/2026-03-25-the-two-anchor-pattern-for-long-context-prompts/"
summary: "Long context alone does not guarantee reliable retrieval. A two-anchor prompt design—documents first, question last, with mandatory quote extraction—improves answer quality on dense multi-document tasks."
tags:
  - ai agents
  - prompt engineering
  - long context
  - llm reliability
  - workflow design
author: "vabs"
status: "published"
---

## TL;DR

Large context windows are useful, but they do **not** guarantee the model will use the right evidence.

A reliable default for long-document tasks is the **Two-Anchor Pattern**:
1. **Anchor 1 (top):** place all source documents first in a structured block.
2. **Anchor 2 (bottom):** place the actual task/query at the end.
3. In between, require a **quote-first extraction step** before synthesis.

This pattern is simple, model-agnostic, and directly addresses the common “lost in the middle” failure mode.

## Context

Teams often assume that once they upgrade to a model with a larger context window, document QA and synthesis quality will automatically improve.

But evidence suggests a more nuanced reality:
- The *Lost in the Middle* paper showed that model performance often drops when relevant information appears in the middle of long inputs, even for long-context models.
- Anthropic’s long-context guidance recommends placing longform data near the top and putting queries at the end; it also recommends grounding responses in extracted quotes first.

So the main problem is not just token capacity; it is **retrieval reliability inside the window**.

## Key Points

### 1) Long context increases capacity, not guaranteed recall quality

A 100k+ context lets you include more material, but the model can still underweight relevant details depending on position and prompt structure.

Treat long context as bandwidth, not accuracy.

### 2) Position matters: beginning/end often outperform middle

In *Lost in the Middle*, models were typically strongest when relevant facts were near boundaries and weaker when they were buried mid-context.

Prompt design should exploit this by intentionally using boundary placement.

### 3) The Two-Anchor Pattern is a practical default

- **Top anchor:** put full source documents first, consistently tagged.
- **Bottom anchor:** put the final question/instructions at the end.
- **Bridge step:** require quote extraction with source IDs before final reasoning.

This reduces hallucinated synthesis because the model must “show receipts” before conclusions.

### 4) Quote-first is the key anti-noise move

When documents are dense, asking the model to output relevant quotes first creates a lightweight verification layer.

If the quotes are weak, you catch failure earlier—before a polished but wrong summary gets shipped.

### 5) Keep output contract strict

Use explicit output sections (e.g., `quotes`, `analysis`, `answer`) and require source attribution for each claim.

This makes both human review and automated checks easier.

## Steps / Code

### 10-minute implementation checklist

```text
1) Wrap each source in structured tags with a stable source id.
2) Put all source blocks at the top of the prompt.
3) Put your task/query at the end of the prompt.
4) Force a quote-extraction phase before synthesis.
5) Require every major claim to reference source ids.
6) Reject/regenerate if quotes do not support the answer.
```

### Prompt skeleton

```xml
<documents>
  <document index="1">
    <source>policy_memo_2026-03-20.md</source>
    <document_content>
      {{DOC_1}}
    </document_content>
  </document>
  <document index="2">
    <source>incident_review_q1.md</source>
    <document_content>
      {{DOC_2}}
    </document_content>
  </document>
</documents>

<task>
You must follow this order:
1) Extract 5-10 verbatim quotes relevant to the question with source ids.
2) Briefly explain what each quote implies.
3) Produce final answer using only supported claims.
4) If support is insufficient, say "insufficient evidence".
</task>

<question>
What are the top 3 operational risks and the most defensible mitigations for next quarter?
</question>
```

### Review gate

```text
If a final claim has no supporting quote+source id, treat it as unverified.
```

## Trade-offs

### Costs

1. Slightly longer prompts and responses (higher token cost).
2. Added latency due to extraction-before-synthesis.
3. More rigid output format to maintain.

### Benefits

1. Better reliability on long, noisy, multi-document tasks.
2. Faster human fact-checking via explicit quotes.
3. Lower risk of fluent-but-unsupported conclusions.
4. Easier automation for quality gates.

## References

- Liu et al., *Lost in the Middle: How Language Models Use Long Contexts* (TACL 2023 / arXiv): https://arxiv.org/abs/2307.03172
- Anthropic Docs, *Prompting best practices — Long context prompting*: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/claude-prompting-best-practices#long-context-prompting
- Anthropic News, *100K context windows*: https://www.anthropic.com/news/100k-context-windows

## Final Take

If you work with long context, don’t just “stuff more text” into prompts.

Use boundaries deliberately: **documents first, question last, quotes before conclusions**. That one structural change can produce a major jump in trustworthiness without changing models.

## Changelog

- 2026-03-25: Initial publish with the Two-Anchor long-context pattern and implementation checklist.
