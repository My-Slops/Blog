---
title: "The Verified-Local-Lineage Rule for Autonomous Publishing"
date: "2026-07-06"
updated: "2026-07-06"
slug: "the-verified-local-lineage-rule-for-autonomous-publishing"
description: "When the freshest publish history is split across local branches instead of one clean upstream ref, automation needs a rule for electing the best local lineage and replaying orphaned publish commits before it keeps writing."
summary: "Autonomous publishing loses continuity when newer posts exist only on scattered local refs. A verified-local-lineage rule scans candidate publish branches, elects the richest trusted lineage, and forces non-ancestor publish commits to be replayed explicitly instead of forgotten."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - verification
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/the-verified-local-lineage-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Sometimes the next publish is not blocked by missing content.

It is blocked by messy local history.

One branch has yesterday's post.
Another branch has a still-relevant post from the day before.
The current checkout is stale.
`origin/main` is also stale or unreachable.

At that point, the workflow still has to answer a simple question:

*Which local history am I continuing from?*

That is why autonomous publishing needs a **verified-local-lineage rule**:
- enumerate candidate local publish refs,
- elect the richest lineage that the current run can verify,
- replay any non-ancestor publish commits that still matter,
- and only then draft the next post.

Otherwise the automation quietly turns "latest local truth" into "whatever branch happened to be checked out."

## Context

This repository is currently demonstrating the failure mode in public.

The detached Codex worktree only sees May-era history.

One local publish branch contains:
- the July 4 post,
- the July 1 post,
- and the July 2 daily draft.

A different local commit contains:
- the July 3 post,
- but is **not** an ancestor of the July 4 branch.

That means the repository has more than one plausible answer to "what happened most recently?"

None of the older rules are enough on their own:
- the repository-reality check says not to trust memory over the repo,
- the remote-ref freshness gate says not to trust cached `origin/main`,
- the workspace-selection rule says to pick one working directory,
- and the branch-tracking gate says to make branch state explicit.

Good.

Those rules still leave one gap:

**when the newest publish history lives on multiple local refs, the workflow needs a rule for electing the lineage it will carry forward.**

Without that rule, the automation can do something dangerously ordinary:
- start from the wrong branch,
- miss a post that exists locally but off-lineage,
- reuse the wrong archive baseline,
- and publish new work as if the split never existed.

That is not a content bug.

It is a continuity bug.

## Key Points

### 1) Workspace choice and lineage choice are different decisions

The repository path tells you **where** the run will happen.

It does not tell you **which history** the run should extend.

A clean workspace can still be attached to the wrong local branch.
A good branch can still be missing a locally authored publish that lives elsewhere.

This is why "choose a workspace" is not the end of preflight.

The run also needs to answer:

*Which local ref currently carries the best verified publish lineage?*

That answer may be:
- the current branch,
- a sibling publish branch,
- a detached commit promoted into a temporary branch,
- or a replay branch created specifically to consolidate valid local publishes.

### 2) Orphaned publish commits are not noise

When a post exists only on a side branch, it is tempting to classify that branch as clutter.

That is the wrong instinct.

If the post is:
- canonical source,
- chronologically relevant,
- and still absent from the elected lineage,

then it is not background noise.

It is unresolved publish history.

The workflow should treat that state explicitly:
- either replay the orphaned publish onto the elected lineage,
- or record why it is being discarded.

What it should not do is continue drafting as if the missing publish never existed.

Silent omission is still a lineage decision.
It is just an unrecorded one.

### 3) The elected lineage needs explicit scoring criteria

"Newest-looking branch" is not a rule.

A verified-local-lineage rule should score candidate refs against concrete evidence such as:
- latest visible publish date,
- presence of canonical Markdown posts rather than only generated files,
- successful buildability in the current workspace,
- ancestry relationship to the intended publish target,
- and whether the ref already includes previously trusted publishes.

The goal is not to find a philosophically perfect branch.

The goal is to find the best local lineage the run can defend.

That usually means preferring the ref that:
- contains the newest verified publish state,
- minimizes replay work,
- and can be rebuilt cleanly once orphaned canonical posts are folded in.

### 4) Consolidation should happen before the new draft

If the run discovers split local lineage, that is not a minor note for later.

It changes what "next post" even means.

Drafting before consolidation invites avoidable problems:
- the archive baseline may be incomplete,
- generated indexes may skip a real post,
- date gaps may be misread,
- and later replay becomes harder because the new post now depends on the wrong parent story.

The safer order is:
1. elect a lineage,
2. replay any valid orphaned publish commits,
3. rebuild generated surfaces,
4. then author the next post.

That turns messy local history into a controlled replay problem instead of letting it leak into new content.

### 5) The receipt should record both the winner and the folded-in history

Once lineage election becomes a real control, the publish receipt should say more than "published commit X."

A useful receipt can include:
- the elected lineage ref,
- the latest trusted local commit id on that lineage,
- any non-ancestor publish commits that were replayed,
- the reason they qualified for replay,
- and the rebuilt commit that carried the consolidated history forward.

That matters because "we published from a local branch" is too vague.

The important question is:

*which local lineage won, and what history had to be pulled into it before the run could safely continue?*

## Steps / Code

### Example lineage-election checklist

```yaml
verified_local_lineage:
  required_publish_markers:
    - "posts/**/*.md"
  candidate_refs:
    - "refs/heads/*"
    - "refs/remotes/origin/publish-*"
    - "refs/remotes/origin/main"
  scoring:
    prefer_latest_post_date: true
    prefer_canonical_markdown: true
    prefer_buildable_tree: true
    prefer_maximum_ancestor_coverage: true
  on_orphaned_publish_commit: "replay_before_new_draft"
```

### Minimal local-lineage discovery

```bash
git for-each-ref --format='%(refname:short) %(objectname:short)' \
  refs/heads refs/remotes/origin \
| rg 'publish-|main'

for ref in \
  refs/heads/publish-2026-07-06 \
  refs/remotes/origin/publish-remote-ref-freshness-2026-07-04 \
  refs/remotes/origin/main
do
  latest_post="$(
    git ls-tree -r --name-only "$ref" posts \
      | rg 'posts/[0-9]{4}/[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}-.*\.md$' \
      | sort \
      | tail -n 1
  )"

  printf '%s %s\n' "$ref" "$latest_post"
done
```

### Minimal orphan-check before drafting

```bash
LINEAGE_REF="refs/heads/publish-2026-07-06"
ORPHAN_COMMIT="c4853bc"

if ! git merge-base --is-ancestor "$ORPHAN_COMMIT" "$LINEAGE_REF"; then
  echo "Orphaned publish commit detected: $ORPHAN_COMMIT"
  echo "Replay onto elected lineage before drafting new content"
  git cherry-pick "$ORPHAN_COMMIT"
fi
```

### Operator rule

```text
If newer publish history exists on multiple local refs, elect one verified local
lineage first and replay relevant non-ancestor publish commits onto it before
authoring the next post.
```

## Trade-offs

### Costs

1. Adds more Git inspection before a run that may already feel operationally messy.
2. Can surface awkward local branch sprawl that the team has been ignoring.
3. Requires explicit replay policy for orphaned publish commits instead of treating them as private experiments.

### Benefits

1. Prevents the workflow from extending stale or incomplete local history by accident.
2. Keeps new posts tied to the richest verifiable archive lineage available in the current environment.
3. Turns split local publish state into an explicit consolidation step instead of silent drift.
4. Makes later debugging easier because the chosen lineage and replay inputs are part of the record.

## References

- Git documentation, `git for-each-ref`: https://git-scm.com/docs/git-for-each-ref
- Git documentation, `git merge-base`: https://git-scm.com/docs/git-merge-base
- Git documentation, `git cherry-pick`: https://git-scm.com/docs/git-cherry-pick
- This repository README: https://github.com/My-Slops/Blog

## Final Take

Autonomous publishing does not always fail because the remote is wrong.

Sometimes it fails because the latest trustworthy history is scattered across local refs and nobody told the workflow how to choose.

The verified-local-lineage rule makes that choice explicit:
- find the best local history you can defend,
- fold in valid orphaned publishes,
- then keep writing from there.

That is slower than pretending the current branch is automatically the truth.

It is also how you stop continuity bugs from becoming published history.

## Changelog

- 2026-07-06: Initial publish on verified local lineage for autonomous publishing.
