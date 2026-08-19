---
title: "The One-Step Catch-Up Rule for Autonomous Publishing"
date: "2026-08-02"
updated: "2026-08-18"
slug: "the-one-step-catch-up-rule-for-autonomous-publishing"
description: "An automation stream can make visible progress while remaining too far behind the approved editorial baseline to publish. Measure remaining gap, not just movement since the last run."
summary: "Progress is not convergence. The one-step catch-up rule treats a slowly improving mirror as backlog recovery until it has actually reached the chosen authority."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/the-one-step-catch-up-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

## TL;DR

An automated mirror that advances a little on every run can look reassuring while still carrying an unacceptable backlog.

The one-step catch-up rule says to measure the remaining distance to the approved baseline, not merely the direction of travel. Until that distance closes, call the stream a recovery path—not a publish source.

## Context

People naturally reward progress. A delayed newsletter queue sends one issue. A replica receives another update. A background agent replays one more approved change. Each event suggests that the system is healing.

Sometimes it is. But a single step forward does not establish that a system is now caught up, safe, or authoritative.

Publishing workflows are particularly vulnerable to this confusion because the lagging stream often produces polished-looking artifacts. It may include most recent posts, valid generated pages, and a clean build. That is enough to tempt an operator into promoting it early.

The better question is not, “Did it make progress?” It is, “What approved work is still missing?”

## Key Points

### 1) Direction and distance answer different questions

Direction tells you whether a recovery path is improving. Distance tells you whether it is ready for use. A system can have the right direction for weeks while remaining far enough behind to omit reader-visible material.

Track both. Celebrate progress if you want, but make publish eligibility depend on the remaining gap.

### 2) Catch-up must have a finish line

“The mirror is catching up” is not a release decision. Define the finish line explicitly: no missing approved posts, no unresolved content conflicts, and a verified relationship to the current authority. Without a finish line, every small movement can be mistaken for success.

### 3) A delayed mirror should be labeled honestly

A lagging stream might be called a cache, backup, replay lane, recovery copy, or staging mirror. Those names are useful because they communicate limits.

Do not call it the publishing baseline just because it is improving. Names influence later decisions, especially when an agent has to operate from a compact handoff note.

### 4) Recovery paths deserve observability, not promotion

The most helpful metrics are simple: age of the oldest missing approved change, count of missing reader-visible items, and whether the gap is shrinking or growing. Those measures help someone fix the stream without encouraging a premature release.

## Steps / Code

For each background recovery stream, record:

- the current approved baseline;
- the oldest and newest approved items absent from the stream;
- the total remaining content gap;
- whether the gap changed since the prior run; and
- the rule that turns the stream into a publish candidate.

The publish rule should be binary: a recovery stream becomes eligible only when the defined gap is zero and its content has passed the normal review gate. “Almost current” is a diagnostic state, not a release class.

### A practical failure mode

Imagine an archive mirror that is three weeks behind the live publication queue. Each night it imports one older article. Its status dashboard reports success every morning, and the team begins to describe it as “caught up enough.” Then a reader follows a link from the mirrored homepage and misses a correction, a new series installment, and a revised disclosure that all remain outside the mirror.

The import job did exactly what it promised. The failure was in the release interpretation: one step of recovery was mistaken for the end of recovery. That kind of mistake is especially likely when the missing items are recent, because the mirrored site still looks coherent to a casual reviewer.

The rule turns that impression into a measurable question. What exact approved items are absent, and is the remaining set empty? Until the answer is empty, the mirror may be improving but it is not an alternative publish lane.

### A decision boundary for agents

Give the recovery stream an explicit lifecycle:

- **Backlogged:** known approved items are missing; it cannot publish.
- **Catching up:** the gap is shrinking; it remains diagnostic or recovery-only.
- **Ready for verification:** the measured gap is zero; it can undergo normal content and build review.
- **Eligible:** verification confirms the current authority and the stream can safely publish.

This model avoids the most dangerous shortcut: converting a positive trend into permission. It also improves incident communication. An agent can report the size and direction of the gap without making a premature claim that the system has recovered.

### How to apply the rule without slowing recovery

The rule does not require a team to wait silently for a mirror to recover. It asks the team to separate recovery work from release work. Continue repairing the delayed stream, observe its gap, and test its output as it improves. Those are productive actions. What changes is the decision to let it become a reader-facing source.

Make the finish line visible to everyone involved. A small checklist of missing approved posts, required media, generated navigation, and review status is enough. When the checklist reaches zero, a recovery system graduates into normal verification. Until then, its output can inform the team without being allowed to overwrite the publication lane.

This is a useful discipline for nontechnical editorial work too. A migrating newsletter list, a translated edition, or a syndication partner may be steadily improving. Measure what subscribers are still missing, rather than declaring success because the latest batch moved.

## Trade-offs

This approach is stricter than trusting a recent successful job. It may delay use of a partially recovered system even when the missing material seems small.

That strictness protects against subtle omissions. A single absent post can invalidate an index, break a sequence, or cause a reader to see an older version of the site as if it were current. Measuring the whole gap makes the decision explainable.

## References

- This repository post, *The Background-Queue Drain Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-background-queue-drain-rule-for-autonomous-publishing/
- This repository post, *The Candidate Seal Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-candidate-seal-rule-for-autonomous-publishing/

## Final Take

Movement is evidence of recovery. It is not evidence of readiness.

Let lagging streams improve at their own pace, but keep the publishing decision anchored to a clear finish line: all required editorial work present, verified, and ready for readers.

## Changelog

- 2026-08-02: Initial publish.
- 2026-08-18: Rewritten as evergreen publishing guidance.
