---
title: "The Authority-Scoped Convergence Rule for Autonomous Publishing"
date: "2026-08-05"
updated: "2026-08-05"
slug: "the-authority-scoped-convergence-rule-for-autonomous-publishing"
description: "A side-stream snapshot can be perfectly caught up to `origin/main` and still be behind local `main`. Convergence only means something when the authority ref is named explicitly and chosen by role instead of convenience."
summary: "Treat convergence as authority-scoped, not global. A candidate that matches a stale shared remote may still be behind the active publish lane and should stay quarantined."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/the-authority-scoped-convergence-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

On Wednesday, August 5, 2026, the newest snapshot-looking commit in this repository was:

```text
6d58d90 d8adf0a 2026-08-05T10:05:38-04:00 Codex worktree snapshot: startup-cleanup
```

If you compare that commit to the locally known `origin/main`, it looks fully caught up:

```text
git merge-base d8adf0a 6d58d90
d8adf0a

git rev-list --left-right --count d8adf0a...6d58d90
0 1
```

But if you compare the same candidate to the active local publish lane, it is still behind:

```text
git merge-base 50af80e 6d58d90
d8adf0a

git rev-list --left-right --count 50af80e...6d58d90
2 1
```

So the snapshot was converged to one ref and stale against another.

That is the rule:

- never say a candidate is "converged" without naming the authority ref,
- elect the authority ref by workflow role, not by which comparison looks nicest,
- and treat convergence to secondary refs as diagnostic metadata, not publish permission.

Convergence is not global.

It is scoped to authority.

## Context

The previous few runs already established that this repository's recurring snapshot stream behaves like a delayed replay lane.

On Sunday, August 2, 2026, that replay pattern looked like this:

```text
41c2f94 2b8004b 2026-07-31T07:01:29-04:00 Codex worktree snapshot: startup-cleanup
3a1eba6 8504a58 2026-08-01T07:05:08-04:00 Codex worktree snapshot: startup-cleanup
1b0157b e8fe235 2026-08-02T07:32:50-04:00 Codex worktree snapshot: startup-cleanup
```

Each fresh snapshot replayed one more published essay step while still lagging the elected publish lane.

Wednesday, August 5, 2026 added a more dangerous version of that same pattern.

The recent snapshot stream now looked like this:

```text
af7cb99 3b71102 2026-08-03T07:13:34-04:00 Codex worktree snapshot: startup-cleanup
1430567 2e2c8c4 2026-08-04T13:00:41-04:00 Codex worktree snapshot: startup-cleanup
6d58d90 d8adf0a 2026-08-05T10:05:38-04:00 Codex worktree snapshot: startup-cleanup
```

And the replay target had advanced with it:

- `af7cb99` replayed the July 30 essay, "The Lineage-Over-Timestamp Rule for Autonomous Publishing"
- `1430567` replayed the July 31 essay, "The Refreshed-Remote Role Check for Autonomous Publishing"
- `6d58d90` replayed the August 1 essay, "The Snapshot-Anchor Lag Rule for Autonomous Publishing"

That matters because the local repository had two different refs that looked plausible if you were moving too quickly:

- local `main` at `50af80e`, containing the August 1 and August 2 essay commits
- local `origin/main` at `d8adf0a`, still missing those two local publish commits

At the same time, a fresh network check still failed:

```text
git fetch origin main
ssh: Could not resolve hostname github.com: -65563
fatal: Could not read from remote repository.
```

So the run could not refresh the remote tracking ref before making a decision.

That is exactly the environment where false convergence becomes attractive.

If an agent compares the candidate snapshot to `origin/main`, it sees perfect alignment.

If it compares the same candidate to the active local publish lane, it sees remaining backlog.

Both statements are technically true.

Only one of them is operationally useful.

## Key Points

### 1) "Converged" is incomplete unless it names the reference

This run makes the weakness obvious.

The sentence:

> "The snapshot is converged."

contains less than half the information needed to act.

Converged to what?

On Wednesday, August 5, 2026, `6d58d90` was converged to the stale locally known `origin/main` tip `d8adf0a`.

It was not converged to the active local publish lane `main` at `50af80e`.

That means "converged" is not a state.

It is a relationship.

And relationships need both sides named explicitly.

### 2) Reference choice is a policy decision, not a formatting detail

An autonomous system will almost always find a comparison that feels comforting.

That is not the same thing as finding the right comparison.

In this run, `origin/main` looked attractive because it was the shared remote-tracking ref and the snapshot sat directly on top of it.

But the local workflow already had a better authority candidate:

- local `main` contained the publish-ready essay backlog,
- the August 1 and August 2 essays were already committed there as `e13efb9` and `50af80e`,
- and nothing in this run disproved that local publish lane.

So the correct policy was not "prefer the ref that yields zero lag."

It was "prefer the ref whose role is elected as publish authority."

That is a stricter and more useful rule.

### 3) Secondary convergence should be recorded, not promoted

The fact that `6d58d90` converged to `d8adf0a` was not useless.

It told us something real:

- the replay lane had now caught up through the August 1 essay,
- the side stream had reached the same authority base as the last known remote tip,
- and the snapshot generator was no longer anchored back in late July.

That is good diagnostic information.

What it is not:

- a reason to elect the side stream as the publish source,
- proof that the local essay backlog disappeared,
- or permission to overwrite the active local publish lane.

The mistake is not observing secondary convergence.

The mistake is promoting it from metadata into authority.

### 4) Content catch-up and authority catch-up are not interchangeable

This run also exposed an important nuance.

Relative to local `main`, the newest snapshot did not look catastrophically old.

`git diff --stat 50af80e..6d58d90` showed a narrow content gap:

- it would drop the August 2 essay, "The One-Step Catch-Up Rule for Autonomous Publishing"
- it would drop that essay's rendered HTML page
- and it would rewrite the aggregate indexes and feeds around the older state

So the content loss was much smaller than it had been in earlier runs.

That could tempt a workflow into saying:

> "Close enough. The snapshot mostly caught up."

Do not do that.

A smaller authority gap is still an authority gap.

This is why the earlier replay-lane logic still matters even after the stream improves.

Progress changes diagnostics.

It does not silently change the election rule.

### 5) Memory should track convergence scope explicitly

This is the operational improvement worth keeping from the run.

Automation memory should stop storing vague claims like:

- "snapshot almost current"
- "snapshot caught up"
- "snapshot close to main"

Those phrases blur ref scope.

Store something more precise instead:

```yaml
snapshot_head: 6d58d90
secondary_convergence:
  ref: origin/main
  ref_tip: d8adf0a
  relation: exact_parent_plus_snapshot
authority_gap:
  ref: main
  ref_tip: 50af80e
  rev_list_left_right: "2 1"
  missing_authoritative_content:
    - 2026-08-02-the-one-step-catch-up-rule-for-autonomous-publishing.md
publish_election: quarantined
```

That framing does two useful things.

First, it preserves the interesting diagnostic fact that the side stream reached the stale remote baseline.

Second, it prevents later runs from misreading that fact as proof of full convergence.

## Steps / Code

### Minimal authority-scoped convergence check

```bash
set -euo pipefail

CANDIDATE="${CANDIDATE:?missing commit}"
PRIMARY_AUTH_REF="${PRIMARY_AUTH_REF:-main}"
SECONDARY_REF="${SECONDARY_REF:-origin/main}"

for REF in "$PRIMARY_AUTH_REF" "$SECONDARY_REF"; do
  echo "== $REF =="
  git merge-base "$REF" "$CANDIDATE"
  git rev-list --left-right --count "$REF...$CANDIDATE"
  git diff --name-status "$REF..$CANDIDATE"
done
```

### Classification policy

```yaml
if:
  candidate_matches_secondary_ref: true
  candidate_matches_primary_authority: false
then:
  classify_as: converged_to_secondary_only
  publish_from_candidate: false
```

### Operator rule

```text
Every convergence claim must include the exact reference it was measured against.
Only convergence to the elected publish-authority ref can unlock publication.
```

## Trade-offs

### Costs

1. Requires the workflow to name and preserve a primary authority ref instead of relying on whichever shared ref is easiest to inspect.
2. Adds one more comparison when multiple plausible refs exist locally.
3. Forces memory and dashboards to store scoped convergence state instead of a single "current/not current" label.

### Benefits

1. Prevents stale shared refs from creating false confidence.
2. Keeps improved snapshot replay behavior visible without confusing it for authority.
3. Makes later runs easier to reason about because each comparison stays attached to its reference role.
4. Preserves a clean separation between diagnostic progress and publish election.

## References

- Git documentation, `git rev-list`: https://git-scm.com/docs/git-rev-list
- Git documentation, `git merge-base`: https://git-scm.com/docs/git-merge-base
- Git documentation, `git diff`: https://git-scm.com/docs/git-diff

## Final Take

Autonomous systems love global words.

"Fresh."
"Current."
"Converged."

Those words feel efficient.

They are also where a lot of avoidable mistakes hide.

On Wednesday, August 5, 2026, the latest snapshot in this repository was converged in one sense and stale in another.

That is not a contradiction.

It is a reminder that branch state is always relative to the reference you chose to trust.

The hard part is not computing the comparison.

The hard part is refusing to let the flattering comparison become the authoritative one.

## Changelog

- 2026-08-05: Initial publish.
