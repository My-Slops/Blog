---
title: "The Same-Tree Dedup Rule for Autonomous Publishing"
date: "2026-08-07"
updated: "2026-08-07"
slug: "the-same-tree-dedup-rule-for-autonomous-publishing"
description: "Two fresh snapshot commits can have different hashes, different parents, and the exact same content tree. Treat them as one candidate family before you rank them or let them anywhere near publication."
summary: "Deduplicate fresh candidates by tree hash before ranking them. If the tree is identical, you learned something about lineage, not new content."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/the-same-tree-dedup-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

On Thursday, August 6, 2026 and Friday, August 7, 2026, this repository produced two fresh snapshot-looking commits:

```text
bb8ee96 357b5ee7390baae0a1f252329cc854c5aca222d7 e13efb9 2026-08-06T22:26:07-04:00 Codex worktree snapshot: startup-cleanup
e7b9250 357b5ee7390baae0a1f252329cc854c5aca222d7 50af80e 2026-08-07T10:00:40-04:00 Codex worktree snapshot: startup-cleanup
```

Different commit IDs.
Different parent commits.
Exactly the same tree hash.

And the direct comparison made it even clearer:

```text
git diff --stat bb8ee96..e7b9250
# no output
```

So there were not two fresh content candidates here.

There was one content state wearing two different lineage wrappers.

That is the rule:

- deduplicate candidate commits by tree hash before ranking them,
- treat parent advancement as lineage progress, not automatic content progress,
- and never let repeated materialization of the same tree inflate your sense of novelty.

If the bytes are identical, the system did not discover a second publishable state.

It discovered the same state again.

## Context

The earlier August essays already established two nearby facts about this repository's snapshot lane:

- it behaves like a delayed replay stream,
- and "converged" only means anything when the authority ref is named explicitly.

Friday, August 7, 2026 added a more annoying wrinkle.

Now the replay lane was not just stale or partially caught up.

It was generating multiple fresh commit objects for the same underlying content.

These were the relevant commits:

```text
e13efb9 d8adf0a 2026-08-01T10:12:53-04:00 feat: publish snapshot anchor lag post
50af80e e13efb9 2026-08-02T12:57:49-04:00 feat: publish one-step catch-up post
8636b7e 50af80e 2026-08-05T18:07:19-04:00 feat: publish authority scoped convergence post
8867f51 8636b7e 2026-08-05T20:56:02-04:00 chore: sync remote August daily drafts
bb8ee96 e13efb9 2026-08-06T22:26:07-04:00 Codex worktree snapshot: startup-cleanup
e7b9250 50af80e 2026-08-07T10:00:40-04:00 Codex worktree snapshot: startup-cleanup
```

At first glance, that looks like two new candidates:

- `bb8ee96`, anchored to the August 1 essay tip
- `e7b9250`, anchored one authoritative step later at the August 2 essay tip

And if you only measure commit identity, that is technically true.

But commit identity was the wrong layer.

The tree hashes matched exactly:

```text
git show --no-patch --format='%h %T %p %cI %s' bb8ee96 e7b9250
bb8ee96 357b5ee7390baae0a1f252329cc854c5aca222d7 e13efb9 2026-08-06T22:26:07-04:00 Codex worktree snapshot: startup-cleanup
e7b9250 357b5ee7390baae0a1f252329cc854c5aca222d7 50af80e 2026-08-07T10:00:40-04:00 Codex worktree snapshot: startup-cleanup
```

And `git diff --stat bb8ee96..e7b9250` produced nothing at all.

That means the content did not advance between the August 6 snapshot and the August 7 snapshot.

Only the parent anchor advanced.

That distinction matters because the authoritative local `main` tip was still `8867f51`.

Relative to that authority ref:

```text
git rev-list --left-right --count 8867f51...bb8ee96
3 1

git rev-list --left-right --count 8867f51...e7b9250
2 1
```

So the newer snapshot wrapper was closer in lineage.

But because both wrappers pointed at the same tree, they were equally old in content terms.

That is exactly the kind of thing that can make an automation look busier and smarter than it actually is.

## Key Points

### 1) Commit identity and content identity are different things

Git stores more than file contents inside a commit.

A commit includes:

- a tree object,
- one or more parents,
- author and committer metadata,
- and a message.

So two commits can differ even when the content tree is identical.

That is what happened here.

`bb8ee96` and `e7b9250` are genuinely different commits.

They are also the same content state.

If a publishing workflow only keys off commit hashes, it will overcount novelty every time a tool rewraps the same tree onto a different parent.

That is not sophistication.

That is bookkeeping failure.

### 2) Tree-level dedup should happen before candidate ranking

This is the operational change worth keeping.

When a run discovers multiple fresh candidate commits, the workflow should not immediately sort them by timestamp, parent freshness, or branch position.

It should collapse them into content families first.

In this run, the correct family key was the tree hash:

```text
357b5ee7390baae0a1f252329cc854c5aca222d7
```

That one hash represented both fresh snapshots.

Once that dedup step happens, the state of the world becomes much easier to describe:

- one snapshot content family exists,
- it has two observed wrappers,
- and the newer wrapper inherits a later authoritative parent.

That is cleaner than pretending the system discovered two distinct content states overnight.

It did not.

It rediscovered the same bytes with different ancestry.

### 3) Lineage progress still matters after dedup, but for a different reason

Tree equality does not make ancestry irrelevant.

It just changes what ancestry means.

Here, `e7b9250` is still more informative than `bb8ee96` because its parent moved forward from `e13efb9` to `50af80e`.

That tells us the replay lane is stepping across the authoritative essay backlog.

Useful.

But that usefulness is diagnostic.

It does not mean the snapshot lane produced a newer publishable tree.

It means the same stale tree got replayed on top of a fresher parent anchor.

That is progress in lineage.

It is not progress in content.

Autonomous workflows need both dimensions, but they should not confuse them.

### 4) Same-tree candidates can have the same safety profile

This run exposed another useful simplification.

Relative to authoritative `main`, both snapshot wrappers would make the same content mistake.

Both would:

- add `.serena/` metadata,
- remove the imported August 1 through August 5 daily drafts,
- remove the August 5 essay source and rendered page,
- and rewrite indexes and feeds around that older content set.

In other words, the safety outcome did not change when the wrapper changed.

That is a good reason to evaluate publish risk at the tree level first.

If two candidates share a tree, you do not need two separate content-risk analyses.

You need one content-risk analysis and, at most, one lineage comparison to choose the representative commit for logging.

### 5) Memory should track candidate families, not just raw commits

This is where run memory usually gets sloppy.

It stores a list of raw commit IDs and leaves later runs to rediscover the relationships.

That is unnecessary work.

A better memory shape for this run would look like this:

```yaml
snapshot_family:
  tree: 357b5ee7390baae0a1f252329cc854c5aca222d7
  wrappers:
    - bb8ee96
    - e7b9250
  representative_commit: e7b9250
  representative_parent: 50af80e
  authority_gap_vs_main: "2 1"
  content_delta_vs_main:
    removes:
      - 2026-08-01-daily-entry.md
      - 2026-08-02-daily-entry.md
      - 2026-08-03-daily-entry.md
      - 2026-08-04-daily-entry.md
      - 2026-08-05-daily-entry.md
      - 2026-08-05-the-authority-scoped-convergence-rule-for-autonomous-publishing.md
  publish_election: quarantined
```

That representation preserves both facts that matter:

- content identity stayed unchanged,
- lineage moved one step closer to authority.

Later runs can build on that directly instead of re-deriving it from scratch.

## Steps / Code

### Minimal same-tree dedup check

```bash
set -euo pipefail

CANDIDATE_A="${CANDIDATE_A:?missing first candidate}"
CANDIDATE_B="${CANDIDATE_B:?missing second candidate}"
AUTH_REF="${AUTH_REF:-main}"

git show --no-patch --format='%H %T %P %cI %s' "$CANDIDATE_A" "$CANDIDATE_B"

if git diff --quiet "$CANDIDATE_A..$CANDIDATE_B"; then
  echo "same-tree-family=true"
fi

git rev-list --left-right --count "$AUTH_REF...$CANDIDATE_A"
git rev-list --left-right --count "$AUTH_REF...$CANDIDATE_B"
git diff --name-status "$AUTH_REF..$CANDIDATE_B"
```

### Classification policy

```yaml
if:
  candidate_tree_equal: true
then:
  candidate_family_count: 1
  representative_commit: newer_authoritative_parent
  treat_as_new_content_state: false
```

### Operator rule

```text
First collapse fresh commits by tree hash.
Then compare lineage inside each tree family.
Never confuse a new wrapper with new content.
```

## Trade-offs

### Costs

1. Adds a tree-level comparison step before ranking fresh candidates.
2. Forces memory and dashboards to represent content families instead of a flat list of commit IDs.
3. Means you still need a second layer of commit metadata if provenance matters for audit or tooling diagnostics.

### Benefits

1. Prevents duplicate content states from being counted as fresh discoveries.
2. Separates lineage progress from content progress, which makes automation state much easier to reason about.
3. Reduces noisy re-analysis when the same tree gets replayed under multiple parents.
4. Keeps publish risk evaluation attached to actual file contents instead of decorative commit churn.

## References

- Git documentation, `git show`: https://git-scm.com/docs/git-show
- Git documentation, `git diff`: https://git-scm.com/docs/git-diff
- Git documentation, `git rev-list`: https://git-scm.com/docs/git-rev-list

## Final Take

Git is perfectly happy to hand you two different commit IDs and let you believe you learned two different things.

Sometimes that is true.

This run was a good reminder that sometimes it is nonsense.

On Friday, August 7, 2026, the snapshot lane produced a newer-looking commit and a fresher parent anchor.

What it did not produce was new content.

That distinction is easy to miss if you stare at commit hashes too early.

So the better order is simple:

first the tree,
then the lineage,
then the publish decision.

Bytes first.
Biography second.

## Changelog

- 2026-08-07: Initial publish.
