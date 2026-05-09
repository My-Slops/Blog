---
title: "The Revision Boundary for AI-Assisted Posts"
date: "2026-03-10"
updated: "2026-03-10"
slug: "the-revision-boundary-for-ai-assisted-posts"
description: "A practical distinction for AI-assisted editing: readability edits are cheap; evidence edits are not. A revision boundary keeps polishing from quietly changing truth conditions."
summary: "Most editing damage in AI-assisted writing happens during 'small' rewrites that strengthen a claim without rechecking support. A revision boundary separates prose cleanup from factual modification."
tags:
  - ai writing
  - editing
  - fact checking
  - workflow design
  - credibility
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/03/2026-03-10-the-revision-boundary-for-ai-assisted-posts/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Not all revisions are equal.

Changing a clumsy sentence into a cleaner sentence is usually fine. Changing a tentative sentence into a stronger sentence is a different kind of action.

A **revision boundary** treats these separately:
- readability edits can move fast,
- factual-strength edits trigger re-verification.

That prevents final polish from becoming silent distortion.

## Context

AI-assisted writing has made revision cheaper, but it has also made it easier to blur categories of change.

In older workflows, human effort naturally limited how many times a claim got restated. With AI, you can rewrite a paragraph ten times in two minutes. That is useful for clarity, but risky for precision. Each rewrite is another chance for support and wording to drift apart.

This is a direct cousin of the problem described in OpenAI’s hallucination work: systems often optimize for plausible completion when the workflow rewards smooth answers over calibrated restraint. In editorial terms, the danger is not only the first draft. The danger is the last polished version of the draft, after caveats have been rounded off by "cleanup."

## Key Points

### 1) A cleaner sentence can be a less honest sentence

Many edits that improve rhythm or brevity also increase certainty by accident.

Common examples:
- "may reduce" becomes "reduces"
- "in this sample" becomes invisible
- "one explanation is" becomes "the reason is"
- "some teams" becomes "teams"

The sentence reads better. It may also now claim more than the evidence can carry.

### 2) Separate surface edits from truth-condition edits

A useful editorial distinction:

- **surface edits**: shorten, clarify, de-duplicate, improve flow
- **truth-condition edits**: alter scope, certainty, causality, universality, or factual content

Surface edits are mostly local.

Truth-condition edits are evidence edits, even if they only change one word.

### 3) AI makes truth-condition drift easier to miss

Because the rewritten paragraph usually sounds coherent, reviewers often scan for style and skip semantic comparison.

That is backwards.

The more fluent the rewrite, the more important it is to ask:
- what changed,
- what got stronger,
- what assumption got smuggled in.

### 4) Mark certainty-increasing changes explicitly

You do not need a heavy process for every sentence. You do need a bright line for edits that raise confidence or widen scope.

If an edit does any of the following, re-check support:
- removes a caveat,
- upgrades weak verbs to strong verbs,
- broadens the population or timeframe,
- turns an example into a pattern.

### 5) The final polish pass should be allowed to fail

If the draft is only readable when caveats disappear, the problem is not the caveat. The problem is the draft structure.

Sometimes the right output of a final pass is:
- restore the hedge,
- split the sentence,
- add the source note back,
- leave the awkward precision intact.

That is a better trade than false smoothness.

## Steps / Code

### Revision boundary rule

```text
If an edit changes certainty, scope, causality, or support requirements,
it is no longer "just editing."
Re-check the evidence before keeping it.
```

### Practical edit labels

```markdown
[surface] tighten repetition in opening paragraph
[surface] replace vague transition
[factual] "suggests" -> "shows" requires source re-check
[factual] remove "in this dataset" requires scope review
```

## Trade-offs

### Costs

1. Slower final editing on claim-heavy posts.
2. More explicit judgment about what counts as a factual change.
3. Slightly less elegant prose in some paragraphs.

### Benefits

1. Lower risk of accidental overclaiming.
2. Cleaner separation between writing quality and evidence quality.
3. Easier review handoff between drafter and editor.
4. More trustworthy final copy.

## References

- OpenAI, *Why language models hallucinate*: https://openai.com/index/why-language-models-hallucinate
- OpenAI, *Teaching models to express their uncertainty in words*: https://openai.com/index/teaching-models-to-express-their-uncertainty-in-words/
- NIST, *Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile*: https://doi.org/10.6028/NIST.AI.600-1

## Final Take

The last edit pass should make writing clearer, not truer than it has any right to be.

That requires a revision boundary.

Without one, polish becomes a quiet source of hallucination.

## Changelog

- 2026-03-10: Initial publish on separating readability edits from evidence-changing revisions.
