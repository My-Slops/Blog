# Publish-Surface Novelty Design

Date: 2026-08-08
Topic: `The Publish-Surface Novelty Rule for Autonomous Publishing`

## Context

The last shipped essay on 2026-08-07 established a tree-level dedup rule: two fresh snapshot commits can differ in commit identity and parentage while still representing the same content tree.

Today adds the inverse case. A new snapshot commit exists:

```text
8ab5c66 1cc9e49a31d7803530762f22a34426a2104a3746 50af80e 2026-08-08T07:10:04-04:00 Codex worktree snapshot: startup-cleanup
```

Compared with yesterday's snapshot:

```text
e7b9250 357b5ee7390baae0a1f252329cc854c5aca222d7 50af80e 2026-08-07T10:00:40-04:00 Codex worktree snapshot: startup-cleanup
```

The commit ID and tree hash changed, but the parent anchor stayed the same and the publish-surface diff is empty once `.serena` is excluded.

## Approaches

### 1. Metadata-only freshness

Frame the lesson narrowly: a fresh commit that only changes private tool metadata is not a fresh publishing candidate.

Pros:
- Precise to this run.
- Easy to prove with one diff.

Cons:
- Too specific to `.serena`.
- Risks sounding like a repo hygiene essay instead of a stronger publishing rule.

### 2. Same-parent tree drift

Frame the lesson as "same parent, different tree" and discuss why parent stability does not imply content stability.

Pros:
- Connects cleanly to the earlier same-tree essay.
- Emphasizes git structure.

Cons:
- Overweights git shape.
- Misses the more important distinction: publishable content did not change.

### 3. Publish-surface novelty

Frame the lesson around decision scope: publication decisions should measure novelty only on files that affect the public site, not the entire repository tree.

Pros:
- Generalizes beyond `.serena`.
- Produces a reusable rule for future runs.
- Explains why tree-level novelty is necessary but not sufficient.

Cons:
- Requires defining a publish surface explicitly.

## Recommendation

Choose approach 3.

Title: `The Publish-Surface Novelty Rule for Autonomous Publishing`

Core claim: a snapshot can be new at the repository-tree level while being unchanged at the publish-surface level. Publication automation should score novelty on the publish surface first, then treat private metadata deltas as diagnostic only.

## Proposed Structure

1. TL;DR
   - Show `e7b9250` and `8ab5c66`.
   - Show empty diff outside `.serena`.
   - State the rule.
2. Context
   - Position this as the next refinement after same-tree dedup.
   - Note `main` is currently `e73e403`, fully synced with `origin/main`.
3. Key Points
   - Repository-tree novelty is broader than publish novelty.
   - Decision scope should match served artifacts.
   - Metadata-only changes should not affect publish ranking.
   - Run memory should track both repo-state and publish-surface state.
4. Steps / Code
   - Provide a path-scoped diff check.
   - Show a minimal classification rule.
5. Trade-offs
   - Need a path allowlist or careful exclusions.
   - Some metadata may matter if it becomes public later.
6. Final Take
   - "New hash, same public state" is not publish freshness.

## Evidence To Use

```text
git show --no-patch --format='%h %T %p %cI %s' e7b9250 8ab5c66

git diff --name-status e7b9250..8ab5c66 -- . ':(exclude).serena'
# no output

git diff --name-status e7b9250..8ab5c66 -- .serena
A	.serena/memories/memory_maintenance.md

git rev-list --left-right --count e73e403...8ab5c66
11 1
```

## Self-Review

- No placeholders remain.
- Scope is narrow and distinct from the 2026-08-07 essay.
- The design stays aligned with the established essay series and uses evidence from this run.
