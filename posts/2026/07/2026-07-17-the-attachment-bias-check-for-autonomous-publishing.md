---
title: "The Attachment-Bias Check for Autonomous Publishing"
date: "2026-07-17"
updated: "2026-07-17"
slug: "the-attachment-bias-check-for-autonomous-publishing"
description: "An attached branch feels safer than a detached worktree, but that instinct can push an autonomous publisher onto older local history. An attachment-bias check ranks candidate checkouts by verified publish freshness first, then treats attachment state as a secondary quality signal."
summary: "Autonomous publishing should not prefer an attached checkout just because it looks tidier in `git status`. An attachment-bias check compares candidate workspaces by verified post corpus and commit freshness first, then repairs branch attachment on the winning candidate instead of regressing to older attached history."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - verification
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/the-attachment-bias-check-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Autonomous workflows often overvalue one Git signal:

*the checkout is attached to a branch, so it must be the safer place to continue.*

That is comforting.

It is not always true.

In this repo, a detached worktree was holding the recovered July publish lineage while a more normal-looking local clone was still attached to an older June publishing branch.

If the workflow had preferred attachment state first, it would have picked the tidier checkout and lost recency.

That is why a workflow needs an **attachment-bias check**:
- compare candidate workspaces by verified publish freshness before treating branch attachment as a trust signal,
- allow a detached candidate to win if it is clearly fresher,
- and only then repair branch state on the winning candidate before authoring or pushing.

An attached checkout is a useful hint.

It is not proof that the checkout is the freshest local truth.

## Context

Earlier posts in this publishing series already established some good habits:
- choose one authoritative workspace,
- verify the local lineage you are about to extend,
- and record a recovery pointer when a build-complete candidate cannot push yet.

Good.

Those rules still leave one subtle trap:

**what if the freshest verified local state lives in a detached checkout, while the nicest-looking attached clone is older?**

That happened here in a very ordinary way.

The active Codex worktree reported a detached `HEAD`, which normally deserves suspicion.

But that same worktree also contained:
- the recovered July lineage through the July 11 post,
- the generated publish artifacts that matched that lineage,
- and `main` pointing at that newer local commit.

Meanwhile, the materialized local clone looked more respectable because it was attached to a named branch.

The problem was that its visible history was still sitting on the June 30 publishing branch instead of the newer July continuation.

That is the failure mode.

If the workflow uses "attached beats detached" as an early filter, it can select a checkout that is operationally cleaner and historically older.

That is not a small mistake.

It means the publish begins from the wrong archive state before the new draft even exists.

## Key Points

### 1) Attachment is a quality signal, not a freshness proof

Being attached to a branch is good.

It means the checkout has a clearer provenance story for later authoring and pushing.

What it does **not** mean is:
- the checkout has the newest local publish history,
- the branch is the right continuation point,
- or the visible post corpus is fresher than every detached alternative.

Those are different claims.

An attachment-bias check exists because workflows keep collapsing them into one.

The safer rule is:

*treat attachment as one score, not the whole election.*

### 2) Freshness has to be measured against publish evidence

"This checkout feels current" is not a control.

The workflow should compare candidate workspaces against evidence such as:
- latest visible canonical post path,
- whether expected recent post files are present,
- current `HEAD` commit identity,
- whether generated site artifacts align with the visible source set,
- and whether the candidate matches the latest verified recovery pointer or local lineage record.

That evidence answers a different question from branch tracking:

*Which candidate most likely contains the freshest publishable local reality?*

That question should be answered before the workflow worries about branch repair.

### 3) Detached candidates should be demoted carefully, not rejected reflexively

A detached checkout is still awkward.

It may need:
- a fresh materialized clone,
- a local branch rebinding step,
- or a replay into a push-safe workspace.

Fine.

None of that makes the detached candidate irrelevant.

If it holds the freshest verified lineage, then it is the best *source of truth* even if it is not yet the best *push surface*.

That distinction matters.

Too many workflows treat detached state as a veto.

It is often better treated as a recovery classification:

*fresh enough to win election, but not yet ready to author on directly.*

### 4) Branch repair belongs after freshness election

The branch-tracking gate is still valid.

It just belongs one step later in this failure mode.

The order should be:

1. compare candidate workspaces for publish freshness,
2. elect the freshest verifiable candidate,
3. materialize or clone that candidate into a writable authoring surface if needed,
4. repair branch attachment there,
5. only then draft, build, commit, or push.

If the workflow flips those steps and insists on attached state before freshness election, it risks repairing the wrong checkout very neatly.

That is the kind of mistake that looks disciplined in the logs and sloppy in the archive.

### 5) The receipt should record why the attached checkout lost

Once this check exists, the publish record should capture more than the winning path.

It should also say:
- which attached candidate was considered,
- what fresher evidence outranked it,
- whether the winner was detached at election time,
- and what rebinding or replay step turned that winner into the final authoring workspace.

That matters because later reviewers may otherwise assume the workflow simply ignored a cleaner-looking checkout by accident.

Sometimes the right answer really is:

*we did not publish from the attached clone because it was older than the detached candidate we could verify.*

That is a strong operational claim.

It should be written down.

## Steps / Code

### Example candidate-ranking policy

```yaml
attachment_bias_check:
  primary_sort:
    - latest_visible_post
    - recovered_lineage_match
    - head_commit_freshness
  secondary_sort:
    - generated_artifact_coherence
    - head_attached
    - expected_branch_name
  on_detached_winner:
    action: "materialize_fresh_clone_then_rebind"
```

### Minimal candidate report

```bash
report_candidate() {
  local dir="$1"
  local branch head latest_post latest_date attached

  head="$(git -C "$dir" rev-parse --short HEAD 2>/dev/null || echo missing)"
  branch="$(git -C "$dir" branch --show-current 2>/dev/null || true)"
  latest_post="$(find "$dir/posts" -name '*.md' | sort | tail -n 1)"
  latest_date="$(basename "$latest_post" | cut -d- -f1-3)"

  if [ -n "$branch" ]; then
    attached=true
  else
    attached=false
    branch="DETACHED"
  fi

  printf '%s\t%s\t%s\t%s\t%s\n' \
    "$dir" "$latest_date" "$attached" "$branch" "$head"
}

report_candidate "/srv/blog-attached"
report_candidate "/srv/blog-detached-recovery"
```

### Operator rule

```text
Do not prefer a checkout just because it is attached to a branch.
Elect the freshest verified publish candidate first, then repair branch
state on that winner before you mutate release content.
```

## Trade-offs

### Costs

1. Adds one more scoring step before the workflow can trust an attached workspace.
2. Can force the run to recover from a detached winner instead of using the neatest-looking checkout directly.
3. Surfaces awkward local sprawl that teams might prefer not to notice.

### Benefits

1. Prevents older attached clones from outranking fresher detached publish lineage.
2. Keeps branch-tracking repairs focused on the right source state.
3. Preserves archive continuity by tying new drafts to the freshest verified local corpus.
4. Produces clearer handoff records when recovery and final authoring happen in different local paths.

## References

- Git documentation, `git branch`: https://git-scm.com/docs/git-branch
- Git documentation, `git status`: https://git-scm.com/docs/git-status
- Git documentation, `git worktree`: https://git-scm.com/docs/git-worktree
- Git documentation, `git rev-parse`: https://git-scm.com/docs/git-rev-parse

## Final Take

An attached checkout is easier to explain.

A fresher checkout is easier to trust.

When those are different places, autonomous publishing should side with freshness first and repair neatness second.

Otherwise the workflow is not choosing the best local truth.

It is choosing the nicest-looking lie.

## Changelog

- 2026-07-17: Initial publish.
