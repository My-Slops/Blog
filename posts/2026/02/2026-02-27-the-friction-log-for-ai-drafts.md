---
title: "The Friction Log for AI Drafts"
date: "2026-02-27"
updated: "2026-02-27"
slug: "the-friction-log-for-ai-drafts"
description: "A simple editorial habit: when an AI draft feels off, capture the exact points of friction before revising. The log becomes reusable prompt and workflow intelligence."
summary: "Most weak AI drafts fail in recurring ways, but vague annoyance hides the pattern. A friction log turns revision pain into a usable system for better prompts, better editing, and more reliable posts."
tags:
  - ai writing
  - workflow
  - editing
  - clarity
  - content quality
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/02/2026-02-27-the-friction-log-for-ai-drafts/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

When an AI draft feels wrong, most people jump straight into rewriting.

That fixes the page, but wastes the pattern.

A **friction log** is a short record of where a draft created resistance:
- unsupported claim,
- generic opener,
- wrong level of specificity,
- tone drift,
- structural repetition.

Once you log those moments explicitly, your revision process stops being reactive and starts becoming reusable.

## Context

One of the stranger things about AI-assisted writing is how often people can tell a draft is "off" without being able to say exactly why.

That matters because vague dissatisfaction is hard to operationalize. If the only lesson after editing is "the model wasn't great," you have learned almost nothing. The next draft will fail in roughly the same way.

OpenAI's recent work on hallucinations is useful here, not only for factual errors but for workflow design. If models are often rewarded for guessing, then any writing process that does not mark where guessing leaked into prose will keep paying that cost later. Google’s people-first content guidance points in the same direction from the publishing side: useful writing is specific, evidence-aware, and shaped around reader needs rather than filler.

The practical implication is simple: **editing pain is data**.

## Key Points

### 1) Friction is more useful than vague dislike

"This draft is bland" is not actionable.

"Paragraph 2 restates the headline without adding information" is actionable.

The point of the log is not to preserve every annoyance. It is to capture the exact places where the draft made you stop trusting it or stop enjoying it.

Useful friction notes usually name one of five failures:
- unsupported assertion,
- empty abstraction,
- wrong audience assumption,
- weak structure,
- repetitive phrasing.

### 2) The first draft should not be the last time you see the failure

If the same problem appears three times in a week, it is no longer a one-off editing issue. It is a system issue.

That could mean:
- your prompt leaves too much freedom,
- your source notes are too loose,
- your output template hides weak reasoning,
- your review step happens too late.

A friction log helps you separate "model made a mistake" from "workflow invited the mistake."

### 3) Log the sentence, not just the category

This is where most people get sloppy.

Do not write:
- "too generic"
- "bad transition"
- "weird claim"

Write:
- exact sentence,
- why it created friction,
- what the better version needed.

That makes the log reusable for future prompting and review checklists.

### 4) Friction clusters reveal what to fix upstream

After five to ten drafts, patterns become obvious.

Examples:
- repeated generic openings suggest a headline or TL;DR problem,
- repeated claim drift suggests weak evidence boundaries,
- repeated tone mismatch suggests unclear audience or anti-goals,
- repeated repetitive structure suggests the template is doing too much of the thinking.

This is the point where editing starts turning into workflow design.

### 5) Keep the log lightweight enough to survive daily publishing

If the system takes 20 extra minutes, you will stop using it.

A practical friction log is tiny:
- one to three moments per draft,
- one sentence each,
- one tag,
- one upstream fix if obvious.

That is enough to compound.

## Steps / Code

### Minimal friction log format

```markdown
| Draft | Friction point | Category | Upstream fix |
|------|----------------|----------|--------------|
| 2026-02-27 | "AI is changing everything" adds no information | empty abstraction | force opener to name one concrete failure mode |
| 2026-02-28 | Claim about reader behavior has no source | unsupported assertion | require evidence note before final draft |
| 2026-03-01 | Section 3 repeats TL;DR in softer words | weak structure | add "new information per section" review pass |
```

### 8-minute friction pass

```text
Minute 0-2: Mark the first place you stopped trusting the draft.
Minute 2-4: Mark the first place you got bored.
Minute 4-6: Mark the first claim that needed support or narrowing.
Minute 6-8: Write one upstream fix for the repeated pattern.
```

## Trade-offs

### Costs

1. Adds a small meta step to revision.
2. Forces you to diagnose your own annoyance more precisely.
3. Surfaces workflow problems you may have been ignoring.

### Benefits

1. Makes editing lessons reusable.
2. Improves prompts without constant reinvention.
3. Reduces repeated draft failures over time.
4. Turns taste into a clearer operating system.

## References

- OpenAI, *Why language models hallucinate*: https://openai.com/index/why-language-models-hallucinate
- Google Search Central, *Creating helpful, reliable, people-first content*: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- NIST, *Artificial Intelligence Risk Management Framework (AI RMF 1.0)*: https://doi.org/10.6028/NIST.AI.100-1

## Final Take

The fastest way to get better AI drafts is not to keep asking for "stronger writing."

It is to capture where trust broke, why it broke, and what upstream rule would have prevented it.

That is what a friction log gives you: less vague irritation, more usable signal.

## Changelog

- 2026-02-27: Initial publish on the friction log pattern for AI drafts.
