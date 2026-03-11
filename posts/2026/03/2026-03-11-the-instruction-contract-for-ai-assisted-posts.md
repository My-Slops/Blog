---
title: "The Instruction Contract: A Simple Way to Get More Reliable AI-Assisted Posts"
date: "2026-03-11"
slug: "the-instruction-contract-for-ai-assisted-posts"
description: "A practical framework for turning vague AI writing prompts into explicit instruction contracts that improve draft reliability and reduce revision loops."
canonical_url: "https://my-slops.github.io/Blog/posts/2026/03/2026-03-11-the-instruction-contract-for-ai-assisted-posts/"
summary: "Most weak AI drafts come from ambiguous instructions, not weak models. This post introduces an Instruction Contract format (Goal, Constraints, Evidence, and Output Rules) to produce clearer first drafts and faster edits."
tags:
  - ai writing
  - prompting
  - blogging
  - editorial workflow
  - knowledge work
  - content quality
author: "vabs"
status: "ready"
---

## TL;DR

If your AI drafts are fluent but off-target, the problem is usually not the model — it’s instruction ambiguity.

Use an **Instruction Contract** before drafting. Define:
1. the exact outcome,
2. hard constraints,
3. evidence expectations,
4. output structure.

This reduces rework, improves factual discipline, and makes quality more repeatable across daily posts.

## Context

A common daily writing pattern looks like this:
- write a broad prompt,
- get a decent-looking draft,
- spend 30–60 minutes fixing drift, tone mismatch, and unsupported claims.

The model did produce text. It just didn’t produce the text you actually needed.

In practice, many prompts behave like loose wishes, not executable specs. The AI fills gaps with plausible defaults, which creates predictable issues:
- generic framing,
- accidental overclaiming,
- inconsistent structure,
- weak continuity with previous posts.

If you publish every day, this compounds into avoidable editing overhead.

## Key Points

### 1) Prompts fail where requirements are implicit

Humans silently assume context:
- audience sophistication,
- acceptable certainty level,
- required sections,
- what counts as evidence.

Models can’t safely infer all of that.

Any requirement you do not state explicitly becomes optional behavior.

### 2) Use an Instruction Contract, not a one-line prompt

A practical contract has four blocks:

- **Goal**: one-sentence definition of what the post must help the reader do or understand.
- **Constraints**: hard boundaries (tone, length range, prohibited fluff, required trade-offs).
- **Evidence Rules**: what claims require sourcing, what can be opinion, and how uncertainty must be labeled.
- **Output Rules**: exact headings/template and formatting rules.

This separates creative freedom from non-negotiables.

### 3) Add priority order when rules conflict

Many “bad outputs” happen because instructions conflict.

Example:
- “Be concise”
- “Include full context and examples”

Without priority, the model guesses.

Add one line:

> Priority: factual correctness > usefulness > brevity > stylistic flourish.

Now trade-offs are deterministic instead of random.

### 4) Define anti-goals to prevent predictable failure

Most people specify what they want but not what they reject.

Include 3–5 anti-goals such as:
- no generic opener paragraphs,
- no invented metrics,
- no unsourced legal/medical/financial claims,
- no repetitive section summaries.

Anti-goals remove common failure modes before generation.

### 5) Treat first draft as a contract compliance check

Don’t start by line-editing.

First evaluate:
1. Did the draft meet the goal?
2. Did it respect constraints?
3. Did it follow evidence rules?
4. Did it match structure exactly?

If not, request a **compliance revision** before stylistic edits. This preserves editing time for high-leverage improvements.

### 6) Why this works for daily publishing

The contract becomes reusable infrastructure:
- same quality bar each day,
- faster onboarding to new topics,
- lower variance between posts,
- easier delegation between human + AI.

You are no longer “prompting from mood.” You’re operating from a system.

## Steps / Code

### 10-minute Instruction Contract workflow

```text
Minute 0-2   Write one-sentence reader outcome (Goal)
Minute 2-4   Define non-negotiable constraints (tone, scope, length, bans)
Minute 4-6   Set evidence rules (what must be sourced, how to mark uncertainty)
Minute 6-7   Paste exact output template/headings
Minute 7-8   Add instruction priority order
Minute 8-10 Add anti-goals + run draft generation
```

### Reusable contract template

```markdown
Goal:
- Help [audience] make/understand [specific decision] about [topic].

Constraints:
- Tone: direct, practical, no hype.
- Scope: one core argument only.
- Length: 900–1400 words.
- Must include trade-offs and actionable takeaway.

Evidence Rules:
- Source all high-impact factual claims.
- Label opinions explicitly.
- If uncertain, state uncertainty clearly.
- Do not invent stats, quotes, or citations.

Output Rules:
- Use headings: TL;DR, Context, Key Points, Steps / Code, Trade-offs, References, Final Take, Changelog.
- Provide frontmatter with title/date/slug/description/summary/tags/author/status.

Priority:
- correctness > usefulness > specificity > brevity > style.

Anti-goals:
- No generic intro fluff.
- No repeated points across sections.
- No unsupported absolute claims.
```

### Compliance revision prompt

```text
Revise this draft for contract compliance only.
Do not improve style yet.
Return:
1) pass/fail for each contract block,
2) corrected draft that satisfies all failed blocks,
3) short note listing what changed.
```

## Trade-offs

### Costs

1. **Slightly more setup per post**
   - You spend 8–10 minutes defining the contract.

2. **Less spontaneous exploration**
   - Hard constraints reduce open-ended wandering.

3. **Heavier upfront thinking**
   - You must decide quality criteria before seeing text.

### Benefits

1. **Higher first-draft hit rate**
   - Fewer “rewrite from scratch” cycles.

2. **Better factual hygiene**
   - Evidence expectations are explicit from the start.

3. **Consistent editorial voice**
   - Daily posts feel coherent across topics.

4. **Faster final edits**
   - You spend time improving ideas, not repairing drift.

## References

- Google Search Central, *Creating helpful, reliable, people-first content*: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- RFC 2119, *Key words for use in RFCs to Indicate Requirement Levels*: https://www.rfc-editor.org/rfc/rfc2119
- Nielsen Norman Group, *How to Write for the Web*: https://www.nngroup.com/articles/how-users-read-on-the-web/

## Final Take

If you publish with AI daily, your biggest leverage is not a new model — it’s a better specification.

An Instruction Contract turns prompting from “hope” into “design.” Once your requirements are explicit, draft quality becomes predictable, editing gets faster, and trust stays intact.

## Changelog

- 2026-03-11: Created first version with Instruction Contract framework, 10-minute setup workflow, reusable template, and compliance revision pattern.
