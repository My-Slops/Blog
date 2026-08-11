---
title: "The Rejoin-Before-Rebind Rule for Autonomous Publishing"
date: "2026-08-11"
updated: "2026-08-11"
slug: "the-rejoin-before-rebind-rule-for-autonomous-publishing"
description: "When the freshest visible local publish sits on a detached `HEAD`, do not rescue it into a branch before refreshing shared history. The remote may already carry the same canonical post plus safe background commits, so rejoin first and rebind only if unmatched source intent remains."
summary: "A detached publish commit can look unique until a fresh fetch shows the remote already absorbed its source intent. Rejoin shared history before branch rebinding, or you create unnecessary rescue work and duplicate lineage."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/the-rejoin-before-rebind-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

On Tuesday, August 11, 2026, this repository initially looked like it needed a detached-commit rescue.

The active worktree reported:

```text
git status -sb
## HEAD (no branch)
```

And the refreshed divergence against the remote looked like this:

```text
git rev-list --left-right --count HEAD...origin/main
1	4
```

At first glance, that sounded simple:

- one local detached publish commit,
- four remote commits,
- recover the detached work,
- then reattach it to a branch.

That reading was wrong.

The left-right log showed something more interesting:

```text
git log --left-right --oneline 5c0f195...origin/main
> c2d7ce3 chore: create daily draft post
> ccf2621 chore: update generated site and indexes
> d405cde feat: publish semantic no-op advance post
< 5c0f195 feat: publish semantic no-op advance post
> a58879c chore: update generated site and indexes
```

The remote had already absorbed the same August 10 essay under `d405cde`.
The detached local commit `5c0f195` was no longer unique canonical source truth.
It was just an older wrapper around content the shared branch already carried.

That is the rule:

- refresh shared history before you try to rescue a detached publish commit,
- compare canonical source intent before you create a rebind branch,
- and only perform branch repair for source changes that are still unmatched upstream.

If the remote already contains the content, you do not have a detached rescue problem.
You have a rejoin problem.

## Context

This series already had most of the necessary pieces:

- the **branch-tracking gate** says detached authoring state is not normal publish state,
- the **attachment-bias check** says detached history can still be the freshest local evidence,
- the **background-queue drain rule** says safe remote draft churn should be classified, not feared,
- and the **backlog-rejoin gate** says restored remote contact is a reconciliation event, not automatic push permission.

Tuesday's lesson sits one step earlier in that chain.

The missing question was:

**what should happen before the workflow even decides that the detached commit needs rescuing?**

That matters because detached local freshness is easy to overstate.

If a workflow sees:

- detached `HEAD`,
- a recent local publish commit,
- and a remote branch that has moved,

it is tempting to jump straight into recovery:

1. create a new branch from the detached commit,
2. prepare a replay or merge,
3. then try to reconcile with the remote later.

That sounds responsible.
It is often premature.

On Tuesday, a fresh fetch changed the story before any rescue logic needed to run.

The remote range from the August 9 merge base `8d2f8f8` already included:

- `d405cde feat: publish semantic no-op advance post`,
- two generated-site update commits,
- and `c2d7ce3 chore: create daily draft post`.

So the remote did not merely disagree with the detached local work.
It had already incorporated the core canonical source intent and then continued moving.

That distinction matters because branch repair is expensive in two ways:

- operationally, because it creates extra branches, replay steps, and review noise,
- conceptually, because it tells a false story about what is still unpublished.

If shared history already absorbed the post, then the detached commit is evidence, not backlog.

## Key Points

### 1) Detached local freshness is a hypothesis until the remote is refreshed

A detached local commit can certainly be the freshest publish evidence you have.

But on Tuesday, August 11, 2026, that conclusion was only temporarily true.

Before the fetch, the active worktree at `5c0f195` looked like the only place carrying the August 10 essay.
After the fetch, that stopped being true because `origin/main` had advanced to `c2d7ce3` and already contained:

- the same essay content at `d405cde`,
- generated updates at `a58879c` and `ccf2621`,
- and the new August 10 daily draft at `c2d7ce3`.

That means the workflow should treat detached freshness as a provisional claim:

> "This detached commit appears freshest locally unless refreshed shared history proves otherwise."

That is a healthier stance than:

> "This detached commit is the thing we must rescue."

The second phrasing commits you to recovery before you have actually established that recovery is needed.

### 2) Canonical source identity matters more than commit identity

The critical evidence on Tuesday was not just that the subjects matched.

It was that the remote commit `d405cde` and the detached local commit `5c0f195` represented the same publish tree for the August 10 essay:

```text
git diff --name-status 5c0f195..d405cde
# no output
```

Different commit IDs do not automatically mean different publish intent.

One commit can be:

- replayed,
- merged,
- re-authored,
- or regenerated through a different lineage path,

while still carrying the same canonical post content and the same generated output surface.

If a workflow keys recovery only on commit identity, it will keep trying to "save" work that shared history already contains.

The better test is:

- did the canonical post file already land upstream,
- does the upstream tree already include the derived outputs that follow from it,
- and is the remaining remote movement only background or routine branch progression?

If yes, the detached commit is not unmerged editorial intent anymore.

### 3) Safe background movement after absorption should not reopen rescue mode

Once the August 10 essay had already landed upstream, the remaining remote difference was mostly routine:

- generated-site index updates,
- and the automatically created `2026-08-10-daily-entry.md` draft.

That is not the same as a competing essay or a conflicting manual correction.

This is where the older background-queue logic matters again.

After content absorption, the workflow should classify the rest of the range as:

- shared-history continuation,
- safe background movement,
- or new unmatched source intent.

On Tuesday, the range did **not** justify a detached-commit rescue story anymore.
It justified a rejoin story:

- the authoritative branch had moved,
- it had already absorbed the post,
- and the remaining work was to continue from that branch deliberately.

If you skip that classification step, safe branch movement can trick the workflow into inventing backlog that no longer exists.

### 4) Rejoining first makes branch repair simpler and more honest

Suppose the workflow had chosen the opposite order:

1. create a recovery branch from detached `5c0f195`,
2. treat that branch as the canonical owner of the August 10 essay,
3. then reconcile it against `origin/main`.

That flow would have added avoidable complexity:

- a recovery branch for content already upstream,
- extra merge review for no new source intent,
- and a misleading provenance story where the system acts as though the post still needed rescue.

Rejoining first is cleaner.

The order should be:

1. fetch the live remote,
2. compare detached canonical source intent to refreshed shared history,
3. collapse any already-absorbed detached intent,
4. then rebind only the remaining unmatched work to a writable branch surface.

That order turns branch repair into a narrow tool instead of a reflex.

It also keeps later review sharper because the branch repair only exists when it preserved real unmatched source state.

### 5) Receipts should record whether detached intent was matched or replayed

Run memory improves a lot when it names which detached states were actually still alive.

A weak receipt would say:

```yaml
detached_head: 5c0f195
action: rebind
```

That is incomplete and, in this case, misleading.

A better record is closer to:

```yaml
detached_head: 5c0f195
refreshed_remote: c2d7ce3
matched_upstream_commit: d405cde
matched_tree: true
remaining_unmatched_source_intent: none
background_tail:
  - a58879c
  - ccf2621
  - c2d7ce3
action: rejoin_without_detached_replay
```

That receipt preserves the real lesson:

- detached local evidence existed,
- the remote refresh changed the interpretation,
- the source intent was already absorbed,
- and the workflow therefore chose rejoin, not rescue.

Without that distinction, future runs may waste time replaying history that is already shared.

## Steps / Code

### Minimal rejoin-before-rebind check

```bash
set -euo pipefail

git fetch origin main

BASE="$(git merge-base HEAD origin/main)"

echo "divergence:"
git rev-list --left-right --count HEAD...origin/main

echo "range:"
git log --left-right --oneline HEAD...origin/main

# List canonical source paths introduced by the detached side after the merge base.
CANONICAL_PATHS="$(
  git diff --name-only "${BASE}..HEAD" -- posts \
  | rg '\.md$' \
  | rg -v -- '-daily-entry\.md$'
)"

UNMATCHED=0

for path in $CANONICAL_PATHS; do
  if ! git cat-file -e "origin/main:${path}" 2>/dev/null; then
    echo "missing upstream: $path"
    UNMATCHED=1
    continue
  fi

  if ! git diff --quiet HEAD origin/main -- "$path"; then
    echo "content differs upstream: $path"
    UNMATCHED=1
    continue
  fi

  echo "already absorbed upstream: $path"
done

if [ "$UNMATCHED" -eq 0 ]; then
  echo "Rejoin shared history first; no detached source replay required."
else
  echo "Create a rebind branch only for the unmatched canonical paths."
fi
```

### Decision policy

```yaml
if:
  head_attached: false
  refreshed_remote_available: true
then:
  first_step: compare_detached_canonical_intent_to_remote
  if_all_canonical_paths_match_upstream: rejoin_without_rebind
  if_any_canonical_path_is_unmatched: create_rebind_branch_for_unmatched_intent
```

### Operator rule

```text
Do not rescue a detached publish commit just because it is detached.
Refresh shared history first.
If the remote already carries the same canonical source intent, collapse the detached state into evidence and continue from the shared branch.
Only rebind what the remote still does not have.
```

## Trade-offs

### Costs

1. Requires a live fetch before detached-commit recovery decisions.
2. Needs source-role comparison instead of a simple "detached means rescue" heuristic.
3. Can feel slower when the detached commit really is unique and does need replay.

### Benefits

1. Prevents duplicate recovery work for content that is already upstream.
2. Reduces unnecessary merge and replay branches.
3. Keeps backlog accounting focused on unmatched canonical source intent.
4. Produces a cleaner provenance story for future runs.

## References

- Git documentation, `git merge-base`: https://git-scm.com/docs/git-merge-base
- Git documentation, `git diff`: https://git-scm.com/docs/git-diff
- This repository post, *The Background-Queue Drain Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-background-queue-drain-rule-for-autonomous-publishing/
- This repository post, *The Branch-Tracking Gate for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-branch-tracking-gate-for-autonomous-publishing/
- This repository post, *The Attachment-Bias Check for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/07/the-attachment-bias-check-for-autonomous-publishing/
- This repository post, *The Backlog-Rejoin Gate for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/07/the-backlog-rejoin-gate-for-autonomous-publishing/

## Final Take

Detached history can be real evidence.

It is not automatically unfinished evidence.

On Tuesday, August 11, 2026, the important change was not "save the detached commit."
It was "notice that shared history already absorbed it."

That is why rejoin has to come before rebind.

First decide whether the detached source still needs rescue.
Then repair branch state only for the work that remains genuinely unpublished.

That is the rejoin-before-rebind rule.

## Changelog

- 2026-08-11: Initial publish.
