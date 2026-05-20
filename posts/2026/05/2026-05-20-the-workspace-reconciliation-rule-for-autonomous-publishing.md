---
title: "The Workspace-Reconciliation Rule for Autonomous Publishing"
date: "2026-05-20"
updated: "2026-05-20"
created_at: "2026-05-20T10:00:00-04:00"
published_at: "2026-05-20T10:00:00-04:00"
scheduled_at: "2026-05-20T10:00:00-04:00"
slug: "the-workspace-reconciliation-rule-for-autonomous-publishing"
description: "A publish that succeeds from a fallback clone can still leave the primary worktree stale, detached, or structurally broken. A workspace-reconciliation rule makes the workflow restore a trustworthy local state before the next autonomous run begins."
summary: "Autonomous publishing can succeed remotely while the primary workspace stays stale or detached. A workspace-reconciliation rule makes the system re-sync, re-verify, or recreate its working tree before the next run reasons from obsolete local state."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - operations
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/the-workspace-reconciliation-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

A remote publish can succeed while the workspace that launched it remains wrong.

That sounds minor until the next autonomous run starts from that stale local copy and makes decisions from an obsolete view of reality.

That is why a workflow needs a **workspace-reconciliation rule**:
- if a publish finishes from a fallback clone, emergency worktree, or alternate machine,
- the primary workspace must fetch the published remote state,
- verify that its branch and worktree metadata are still sane,
- confirm that the canonical source file exists locally,
- and either repair or replace the workspace before the next run begins.

If the public site is right but tomorrow's workspace is still lying, the publish is not operationally complete.

## Context

Autonomous publishing systems often treat "the new commit landed on `main`" as the finish line.

That is incomplete.

Sometimes a run needs an escape hatch:
- the original worktree cannot switch cleanly,
- a linked worktree's administrative files have gone stale,
- the branch cannot be updated safely in place,
- or a recovery publish has to happen from a temporary clone.

In those cases, the remote branch can end up correct while the original workspace stays:
- detached,
- behind the published branch tip,
- missing the newly published canonical source file,
- or structurally confused about which worktree owns which state.

That split is not just annoying.

It creates a local fork of operational reality.

The next run may then do exactly the wrong things:
- rebuild indexes from an incomplete source tree,
- draft from an outdated branch tip,
- "recover" a problem that was already fixed elsewhere,
- or publish a new post from a workspace that never learned about the last one.

This month's publishing rules already cover source authority, remote freshness, receipts, rollback, and builder identity.

They still need one more rule:

**after any out-of-band publish, reconcile the primary workspace before trusting it again.**

## Key Points

### 1) Remote success does not automatically repair local state

This is the mistake people make when they are relieved the emergency publish worked.

They assume:
- the site is correct,
- the commit is on the remote,
- so the system is back to normal.

Not necessarily.

If the publish happened from a fallback clone or disposable worktree, the original workspace may still be:
- detached from any branch,
- pointed at an older commit,
- missing canonical source files,
- or carrying broken worktree metadata.

The remote can be healthy while the primary operator environment is still unfit for the next run.

### 2) Reconciliation is part of publish completion, not a nice-to-have cleanup

The workspace repair step should not live in someone's memory.

It should be part of the publishing contract.

A publish receipt or operator log should answer:
- where the successful publish actually ran,
- which branch tip became canonical,
- whether the primary workspace has been reconciled,
- and whether that workspace is still eligible for future runs.

Without that, teams can prove what readers saw, but not whether tomorrow's automation is grounded in the same truth.

### 3) Reconcile three things: refs, worktree health, and expected source files

Fetching alone is not enough.

The workflow should verify three separate questions:

1. **Refs:** did the local repository learn the published remote tip?
2. **Worktree health:** is the intended workspace attached to the right branch and administratively sound?
3. **Expected source files:** does the canonical post that was just published actually exist in the workspace that will draft tomorrow's content?

Missing any one of those can still leave the next run reasoning from a broken base.

This is why "I fetched" and "I am reconciled" are not the same statement.

### 4) Fresh replacement is often safer than heroic in-place repair

Git does provide worktree repair tools, and they are useful.

But when a workspace has already crossed into "I do not trust this administrative state" territory, the safest move is often to retire it and create a fresh worktree from the published remote tip.

That approach has two advantages:
- it restores a clean local contract quickly,
- and it avoids subtle half-repairs where the metadata looks better but the source tree is still incomplete.

The rule of thumb is pragmatic:

**repair when the failure is narrow and well-understood; recreate when the workspace itself has become suspicious.**

### 5) The next run should refuse to plan from an unreconciled workspace

This is the gate that makes the rule real.

Before a new autonomous draft starts, preflight should assert that:
- the workspace is on the intended branch or is explicitly marked disposable,
- the published source files are present,
- the worktree inventory looks sane,
- and the local checkout agrees with the remote state it claims to be using.

If those checks fail, the run should stop before idea generation, not after another partial publish.

Otherwise the automation compounds one recovery incident into two.

## Steps / Code

### Minimal reconciliation receipt

```yaml
workspace_reconciliation:
  published_from: "fallback-clone"
  published_ref: "origin/main@a7e6dbd"
  canonical_post: "posts/2026/05/2026-05-18-the-toolchain-fingerprint-rule-for-autonomous-publishing.md"
  primary_worktree: "/workspace/blog"
  primary_state: "detached-and-stale"
  reconcile_before_next_run: true
```

### Basic reconciliation gate

```bash
PRIMARY="/workspace/blog"
REMOTE="origin"
BRANCH="main"
EXPECTED_POST="posts/2026/05/2026-05-18-the-toolchain-fingerprint-rule-for-autonomous-publishing.md"

git -C "$PRIMARY" fetch "$REMOTE" "$BRANCH"

HEAD_NAME="$(git -C "$PRIMARY" symbolic-ref --quiet --short HEAD || echo DETACHED)"
git -C "$PRIMARY" worktree list --porcelain

if [ "$HEAD_NAME" = "DETACHED" ]; then
  echo "Primary worktree is detached; repair or recreate it before the next publish."
  exit 1
fi

if [ ! -f "$PRIMARY/$EXPECTED_POST" ]; then
  echo "Canonical source missing from the primary worktree."
  exit 1
fi

git -C "$PRIMARY" diff --quiet
git -C "$PRIMARY" diff --cached --quiet
```

### Replacement rule

```text
If the primary worktree cannot be reconciled cheaply and safely, retire it
and create a fresh worktree from the published remote tip. Copy only
unpublished canonical sources that still need to survive.
```

## Trade-offs

### Costs

1. Adds a post-publish repair phase that some teams will find annoying.
2. May require discarding a familiar but unhealthy workspace instead of nursing it along.
3. Forces publish receipts and recovery notes to track more than the final remote commit.

### Benefits

1. Prevents the next run from rebuilding or publishing from an obsolete local state.
2. Keeps canonical source, remote history, and operator workspace aligned.
3. Makes recovery incidents shorter because the system knows when a workspace is no longer trustworthy.
4. Reduces the chance that a successful emergency publish creates a second failure the next day.

## References

- Git documentation, `git worktree`: https://git-scm.com/docs/git-worktree
- Git documentation, `git fetch`: https://git-scm.com/docs/git-fetch
- This repository post, *The Remote-Snapshot Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-remote-snapshot-rule-for-autonomous-publishing/
- This repository post, *The Toolchain-Fingerprint Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-toolchain-fingerprint-rule-for-autonomous-publishing/

## Final Take

An autonomous publish is not fully done when the remote branch is correct.

It is done when the workspace expected to run next is also back on speaking terms with reality.

Reconcile it, repair it, or replace it.

But do not let tomorrow's automation reason from yesterday's broken local state.

## Recovery Notes

- Scheduled slot: `2026-05-20T10:00:00-04:00` (`America/Montreal`).
- Actual replay time: `2026-10-02T14:07:47-04:00` (`America/Montreal`).
- Restored from the original validated unpublished Markdown retained in the scheduled session.

## Changelog

- 2026-05-20: Initial publication for recovered scheduled slot `2026-05-20T10:00:00-04:00`.
