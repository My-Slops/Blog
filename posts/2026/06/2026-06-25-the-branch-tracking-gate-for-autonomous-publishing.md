---
title: "The Branch-Tracking Gate for Autonomous Publishing"
date: "2026-06-25"
updated: "2026-06-25"
slug: "the-branch-tracking-gate-for-autonomous-publishing"
description: "After a workflow chooses a workspace, it still needs to prove that HEAD is attached to the intended local branch, that the branch tracks the intended upstream, and that its ahead/behind state is acceptable. A branch-tracking gate makes that relationship explicit before drafting or building."
summary: "Autonomous publishing gets ambiguous when the chosen repository is detached, on the wrong branch, or quietly diverged from its upstream. A branch-tracking gate checks branch identity, upstream mapping, and divergence policy before the run mutates publish state."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - release-engineering
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-branch-tracking-gate-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Picking the right repository path is not enough.

An autonomous publish can still start from:
- a detached `HEAD`,
- the wrong local branch,
- a branch with no upstream,
- or a branch that quietly diverged from the release target.

That is how workflows create commits that are technically valid but operationally awkward:
- the draft lands on a stranded detached commit,
- the branch tracks the wrong remote target,
- or the run discovers too late that local history was already ahead or behind policy.

That is why a workflow needs a **branch-tracking gate**:
- prove the workspace is attached to the intended local branch,
- prove that branch tracks the intended upstream ref,
- check ahead/behind state against release policy,
- and refuse to draft or build while that relationship is ambiguous.

If the workflow cannot say which branch it is on, what it tracks, and how far it has drifted, it is not actually ready to publish.

## Context

This autonomous-publishing series already covered several adjacent controls:
- workspace selection,
- materialized checkouts,
- remote snapshots,
- remote reachability,
- and signing-mode gates.

Good.

Those controls still leave one very ordinary failure mode:

**the selected workspace is real, but its branch state is not the publish state the workflow thinks it has.**

That happens more often than teams admit.

A worktree can contain the expected files while still being detached on an older commit.

A long-lived clone can be attached to a recovery branch that happens to build fine.

A local `main` can exist without tracking `origin/main`.

Or a branch can already be:
- ahead because of unpublished local backlog,
- behind because the remote advanced,
- or attached to an upstream that belongs to the wrong release path entirely.

Humans often catch that by squinting at `git status` and saying, *wait, what branch am I actually on?*

Automation should not rely on that moment of embarrassment.

Branch state is not cosmetic.

It is part of publish provenance.

## Key Points

### 1) Branch identity is part of the publish contract

When a workflow says it published from "the repo," that is still too vague.

It should be able to answer:

*Which local branch owned this publish from preflight through push?*

That matters because detached `HEAD` state and wrong-branch state fail differently.

Detached `HEAD` means the run may create a commit that is not anchored to the release branch at all.

Wrong-branch state means the commit may be perfectly attached, just attached to the wrong local history.

Those are not minor implementation details.

They change how easy the publish is to review, replay, recover, and explain later.

If the workflow cannot name the current branch deliberately, it should not be writing release-shaped changes yet.

### 2) Upstream mapping is a separate check from branch name

Seeing `main` in the prompt is not enough.

A local branch name only tells you one part of the story.

The workflow also needs to know what that branch tracks.

`main` tracking `origin/main` is one relationship.

`main` tracking `origin/gh-pages`, `upstream/main`, or nothing at all is another.

That is why the gate should distinguish at least four states:
- detached `HEAD`,
- attached branch with no upstream,
- attached branch with the wrong upstream,
- and attached branch with the expected upstream.

Only the last one is a clean default for autonomous publishing.

The rest may still be recoverable, but they are recovery states, not authoring states.

If the workflow plans to publish to `origin/main`, then the upstream relation should say that explicitly before the first draft line is written.

### 3) Ahead/behind state is policy, not trivia

Teams often treat branch divergence as informational:

*ahead 1, behind 2, whatever, we will sort it out later.*

That is too casual for automation.

Ahead/behind state tells the workflow whether its local branch is already carrying surprises.

Examples:
- **ahead** may mean there is unpublished local backlog that needs to be named and reconciled,
- **behind** may mean the remote baseline moved and the run is already stale,
- **ahead and behind** may mean the branch needs replay work before any new content is added.

Those are release-mode decisions.

Some workflows may allow a branch to be ahead by one known backlog commit.

Some may require `+0 -0` before drafting.

Some may allow behind state only if the run first fetches and rebinds to a fresh remote snapshot.

The exact threshold can vary.

What should not vary is whether the workflow has a threshold at all.

Branch divergence should be evaluated as a gate, not read as trivia after the run has already mutated local state.

### 4) Repair branch state before drafting, not after

Once the new post exists on disk, branch ambiguity becomes harder to unwind cleanly.

Now you have to explain:
- whether the draft was written on detached history,
- whether the commit was authored on the wrong local branch,
- and whether replay preserved intent or just rescued a mistake.

That is avoidable.

If the branch-tracking gate fails, the workflow should stop and repair first:
- switch to the intended branch,
- set or correct the upstream mapping,
- fetch and reconcile divergence according to policy,
- or elect a different workspace and replay from canonical source there.

What it should not do is this:

*write the post anyway, then figure out branch reality later.*

That is the branch equivalent of building in a dirty tree and promising to clean it up after success.

The recovery may work.

The provenance story gets worse.

### 5) The receipt should record branch identity, upstream, and divergence

Once branch tracking becomes a first-class control, the publish record should say more than "pushed commit X."

A useful receipt can include:
- the local branch name,
- whether `HEAD` was attached or detached at preflight,
- the upstream ref the branch tracked,
- ahead/behind counts at the time of authoring,
- and any branch repair performed before the publish continued.

That matters because branch failures are not all the same.

A detached publish candidate is a different problem from:
- an untracked local branch,
- a branch that tracks the wrong upstream,
- or a branch that was already ahead by unpublished backlog.

Those states deserve different fixes.

The receipt should keep them separate.

## Steps / Code

### Example branch-tracking policy

```yaml
branch_tracking:
  required_local_branch: "main"
  required_upstream_ref: "refs/remotes/origin/main"
  allowed_divergence:
    ahead: 0
    behind: 0
  on_failure:
    detached_head: "blocked"
    missing_upstream: "blocked"
    wrong_upstream: "blocked"
    divergence: "fetch_and_reconcile_before_drafting"
```

### Minimal preflight gate

```bash
set -euo pipefail

REQUIRED_BRANCH="${REQUIRED_BRANCH:-main}"
REQUIRED_UPSTREAM_REF="${REQUIRED_UPSTREAM_REF:-refs/remotes/origin/main}"

CURRENT_BRANCH="$(git branch --show-current)"
test -n "$CURRENT_BRANCH" || {
  echo "branch gate failed: detached HEAD" >&2
  exit 1
}

test "$CURRENT_BRANCH" = "$REQUIRED_BRANCH" || {
  echo "branch gate failed: on '$CURRENT_BRANCH', expected '$REQUIRED_BRANCH'" >&2
  exit 1
}

UPSTREAM_REF="$(git rev-parse --symbolic-full-name @{upstream} 2>/dev/null)" || {
  echo "branch gate failed: no upstream configured" >&2
  exit 1
}

test "$UPSTREAM_REF" = "$REQUIRED_UPSTREAM_REF" || {
  echo "branch gate failed: upstream is '$UPSTREAM_REF'" >&2
  exit 1
}

BRANCH_STATUS="$(git status --porcelain=v2 --branch)"
AHEAD_BEHIND="$(printf '%s\n' "$BRANCH_STATUS" | awk '/^# branch.ab / {print $3 " " $4}')"

test "$AHEAD_BEHIND" = "+0 -0" || {
  echo "branch gate failed: divergence is '$AHEAD_BEHIND'" >&2
  exit 1
}
```

### Operator rule

```text
Before an autonomous publish writes the post, builds artifacts, or creates a commit,
prove that HEAD is attached to the intended local branch, that the branch tracks the
intended upstream, and that divergence is within policy. If any of those checks fail,
repair branch state first or replay from canonical source in a correctly attached
workspace.
```

## Trade-offs

### Costs

1. Adds another preflight check before any content work begins.
2. Forces the workflow to define an actual divergence policy instead of hand-waving around ahead/behind state.
3. Blocks some "it probably still works" recoveries where a human might be tempted to author on detached or mismatched branch state.

### Benefits

1. Prevents stranded publish commits created on detached history.
2. Separates wrong-branch problems from wrong-workspace and wrong-remote problems.
3. Makes replay decisions cleaner because divergence is detected before new local mutations appear.
4. Produces more credible publish evidence by recording the exact branch relationship that owned the run.

## References

- Git documentation, `git branch` (`--show-current`, upstream configuration): https://git-scm.com/docs/git-branch
- Git documentation, `git rev-parse` (`@{upstream}` syntax): https://git-scm.com/docs/git-rev-parse
- Git documentation, `git status` (`--branch`, porcelain v2 branch headers): https://git-scm.com/docs/git-status
- This repository post, *The Workspace-Selection Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-workspace-selection-rule-for-autonomous-publishing/
- This repository post, *The Remote-Snapshot Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-remote-snapshot-rule-for-autonomous-publishing/

## Final Take

Autonomous publishing should not discover branch reality halfway through authoring.

Pick the workspace first.

Then ask a stricter question:

*is this workspace actually attached to the branch and upstream the publish intends to trust?*

If the answer is fuzzy, stop there.

Fix branch state before the draft exists, not after the commit needs a rescue story.

That is the branch-tracking gate.

## Changelog

- 2026-06-25: Initial publish.
