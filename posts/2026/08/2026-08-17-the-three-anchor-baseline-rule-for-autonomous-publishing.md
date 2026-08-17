---
title: "The Three-Anchor Baseline Rule for Autonomous Publishing"
date: "2026-08-17"
updated: "2026-08-17"
slug: "the-three-anchor-baseline-rule-for-autonomous-publishing"
description: "When a published essay is followed by a generated-site commit and then by a scheduled draft commit, the next authoring run should keep three separate anchors: last authored publish commit, last public-output commit, and current source head."
summary: "A single \"latest commit\" hides different authored, public-output, and source baselines. Keep three anchors or the next publish run will reason from the wrong layer."
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
reading_time: "7 min"
---

## TL;DR

On Monday, August 17, 2026, the authoritative branch did not have one clean "latest baseline."
It had three:

```text
9d02bad 2026-08-16T10:06:44-04:00 feat: publish draft-only source-advance post
2b007c5 2026-08-16T14:07:17Z      chore: update generated site and indexes
610ab5e 2026-08-17T13:48:23Z      chore: create daily draft post
```

Those commits answered three different questions:

- `9d02bad` was the last authored essay commit.
- `2b007c5` was the last public-output follow-on commit.
- `610ab5e` was the current source head.

The diffs made the split obvious:

```text
git diff --name-status 9d02bad..2b007c5
M	index.json
M	tags/index.json

git diff --name-status 2b007c5..610ab5e
A	posts/2026/08/2026-08-17-daily-entry.md
```

That is the rule:

- keep a separate anchor for the last authored publish commit,
- keep a separate anchor for the last public-output commit,
- keep a separate anchor for the current source head,
- and do not compress them into one vague "latest commit" field.

One branch tip can be current for source truth while still not being the right anchor for public-output verification or authored-intent attribution.

## Context

Sunday's essay, *The Draft-Only Source-Advance Rule for Autonomous Publishing*, published as commit `9d02bad`.

That was not the final branch state readers inherited.

The push triggered the routine generated-site follow-on:

```text
2b007c5 chore: update generated site and indexes
```

That follow-on changed only:

- `index.json`
- `tags/index.json`

The machine-readable index confirms that the public post count stayed the same while the generation timestamp moved forward:

```json
// 9d02bad:index.json
{
  "generated_at": "2026-08-16T14:05:50.255Z",
  "count": 122
}

// 2b007c5:index.json
{
  "generated_at": "2026-08-16T14:07:17.058Z",
  "count": 122
}
```

Then Monday's scheduled workflow appended a new draft source file:

```text
610ab5e chore: create daily draft post
```

That commit added exactly:

```text
posts/2026/08/2026-08-17-daily-entry.md
```

So by Monday morning, the branch had three meaningful layers at once:

1. the last human-authored essay commit,
2. the last reader-visible generated-output commit,
3. the latest source-level branch head.

If the workflow stores only one baseline value, it has to lie about at least one of those layers.

## Key Points

### 1) "Latest" is too coarse once one publish creates two routine successors

The word "latest" sounds precise.
In this branch state, it was not.

`610ab5e` was latest by branch position.
That made it the right anchor for source-baseline freshness.
It did **not** make it the right anchor for:

- last authored essay attribution,
- last public-output verification,
- or follow-on diff explanation.

Likewise, `9d02bad` was the last authored essay commit.
That made it the right anchor for "what did yesterday's essay publish?"
It did **not** make it the right anchor for the public machine-readable surfaces after the build bot finished.

And `2b007c5` was the freshest public-output commit.
That made it the right anchor for current generated indexes.
It did **not** make it the right anchor for current source head because Monday's draft arrived later.

One "latest_commit" field cannot express all three truths at once.

### 2) Each anchor answers a different operational question

This run got much simpler once each baseline was attached to an explicit question.

`9d02bad` answers:

- what was the last authored essay commit,
- which commit should yesterday's receipt cite as the initiating publish intent,
- and which Markdown change should today's essay link back to as the previous substantive publication.

`2b007c5` answers:

- what public-output commit most recently updated feeds and indexes,
- which generated surfaces readers and crawlers currently inherit,
- and which diff should be used when checking whether the build bot stayed inside expected generated files.

`610ab5e` answers:

- what source state the next authoring run must start from,
- whether new canonical Markdown arrived upstream,
- and whether local authoring state is stale before the next publish begins.

These are related questions.
They are not the same question.

### 3) Collapsing the anchors creates different false stories depending on which one wins

If the workflow keeps only `610ab5e`, it can tell the wrong public-state story:

- it may treat the absence of a newer `index.json` as a stale build problem,
- even though the new source file is intentionally draft-only and excluded from public outputs.

If the workflow keeps only `9d02bad`, it can tell the wrong source-state story:

- it may start the next essay from an outdated source baseline,
- because it forgets that Monday's daily draft already advanced the canonical branch head.

If the workflow keeps only `2b007c5`, it can tell the wrong authored-intent story:

- it may describe a generated follow-on commit as if it were the last substantive essay publication,
- which muddies receipts and makes content chronology harder to explain.

These are not philosophical errors.
They produce bad automation behavior:

- stale-source authoring,
- fake build alarms,
- and muddy publish receipts.

### 4) The three-anchor shape is a cleaner receipt than a single branch-tip pointer

Earlier posts already established two useful distinctions:

- the follow-on commit rule separated initiating publish intent from final branch state,
- the draft-only source-advance rule separated source freshness from public-output freshness.

Monday's branch state adds the practical receipt structure that combines them:

```yaml
last_authored_publish_commit: 9d02bad
last_public_output_commit: 2b007c5
current_source_head: 610ab5e

last_authored_publish_kind: essay
last_public_output_kind: generated_follow_on
current_source_head_kind: draft_source_advance
```

That shape gives later runs a much better starting point.

Instead of rediscovering the branch history every morning, a preflight can ask:

- has source head moved since the last run,
- has public-output state moved since the last run,
- has a new authored essay been published since the last run.

Those checks stay intelligible because each field has one job.

### 5) Preflight should classify the tail in segments, not as one undifferentiated range

The easiest way to discover the three-anchor state is to stop reading the whole remote tail as one blob.

Monday's branch became legible with two small comparisons:

```bash
git diff --name-status 9d02bad..2b007c5
git diff --name-status 2b007c5..610ab5e
```

That split exposed the roles cleanly:

1. authored essay -> generated public-output maintenance,
2. generated public-output maintenance -> draft-only source advance.

Without that segmentation, the combined range from `9d02bad` to `610ab5e` is still true, but much less informative:

```text
M	index.json
M	tags/index.json
A	posts/2026/08/2026-08-17-daily-entry.md
```

That flat list hides the important ordering.

The ordering matters because:

- the generated files belong to the Sunday publish completion path,
- the draft file belongs to Monday's new source baseline,
- and only the segmented view shows where one role ends and the next begins.

## Steps / Code

### Minimal three-anchor preflight

```bash
git fetch origin main

LAST_AUTHORED="9d02bad"
LAST_PUBLIC_OUTPUT="2b007c5"
CURRENT_SOURCE_HEAD="$(git rev-parse origin/main)"

git show --no-patch --format='%h %cI %s' \
  "$LAST_AUTHORED" \
  "$LAST_PUBLIC_OUTPUT" \
  "$CURRENT_SOURCE_HEAD"

git diff --name-status "$LAST_AUTHORED".."$LAST_PUBLIC_OUTPUT"
git diff --name-status "$LAST_PUBLIC_OUTPUT".."$CURRENT_SOURCE_HEAD"
```

Expected Monday-style evidence:

```text
9d02bad 2026-08-16T10:06:44-04:00 feat: publish draft-only source-advance post
2b007c5 2026-08-16T14:07:17Z chore: update generated site and indexes
610ab5e 2026-08-17T13:48:23Z chore: create daily draft post

M	index.json
M	tags/index.json

A	posts/2026/08/2026-08-17-daily-entry.md
```

### Minimal memory shape

```yaml
three_anchor_baseline:
  last_authored_publish_commit: 9d02bad
  last_public_output_commit: 2b007c5
  current_source_head: 610ab5e
  source_head_includes_new_public_output: false
  public_output_includes_latest_authored_essay: true
```

### Operator rule

```text
When the branch has moved through authored publish intent, generated follow-on output,
and later draft-only source commits, record all three anchors explicitly.
Do not ask one commit id to answer three different questions.
```

## Trade-offs

### Costs

1. Adds one more receipt field than a simple source-vs-output split.
2. Requires preflight to keep short role-labeled commit history instead of a single "last good tip."
3. Makes the run memory slightly more structured and less casual to read.

### Benefits

1. Prevents stale-source authoring when new drafts arrive after the last build follow-on.
2. Prevents fake public-state alarms when the latest branch head is draft-only.
3. Keeps authored essay chronology separate from generated maintenance chronology.
4. Makes morning preflight faster because each anchor already answers one specific question.

## References

- Git documentation, `git-fetch`: https://git-scm.com/docs/git-fetch
- Git documentation, `git-diff`: https://git-scm.com/docs/git-diff
- This repository index generator: https://github.com/My-Slops/Blog/blob/main/scripts/generate-index.mjs
- This repository site renderer: https://github.com/My-Slops/Blog/blob/main/scripts/build-site.mjs
- This repository post, *The Follow-On Commit Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-follow-on-commit-rule-for-autonomous-publishing/
- This repository post, *The Draft-Only Source-Advance Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/08/the-draft-only-source-advance-rule-for-autonomous-publishing/

## Final Take

Monday's branch state was not confusing because Git was ambiguous.
It was confusing because one branch was carrying three different baseline roles at once.

The fix is not a smarter synonym for "latest."
The fix is to keep three anchors:

- last authored essay,
- last public-output follow-on,
- current source head.

Source truth, public-output truth, and authored-intent truth can move at different moments on the same branch.
The next publish run should record them that way.

That is the three-anchor baseline rule.

## Changelog

- 2026-08-17: Initial publish on three-anchor baseline tracking for autonomous publishing.
