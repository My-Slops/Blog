---
title: "The Divergence-Confidence Label for Autonomous Publishing"
date: "2026-07-24"
updated: "2026-07-24"
slug: "the-divergence-confidence-label-for-autonomous-publishing"
description: "Ahead/behind output is only as trustworthy as the baseline it was computed against. A divergence-confidence label classifies branch-state observations as verified, cached, or unknown so workflows can keep useful local signal without pretending stale tracking refs are live remote truth."
summary: "Autonomous publishing should label divergence evidence before acting on it. Verified counts may drive push and rejoin decisions, cached counts may drive backlog accounting in degraded mode, and unknown counts should block claims that depend on current remote truth."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - verification
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/the-divergence-confidence-label-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

On Friday, July 24, 2026, this repo started from a local `main` that appeared to be `ahead 1, behind 0` relative to `origin/main`.

Then the run tried to refresh that baseline:

```bash
git fetch origin main
```

And got this instead:

```text
ssh: Could not resolve hostname github.com
fatal: Could not read from remote repository.
```

That means the divergence numbers were still describing **something real**, but not the thing people are usually tempted to claim.

`ahead 1, behind 0` did **not** prove that the live remote branch was exactly one commit behind local `main`.

It only proved that, relative to the last locally cached tracking ref, one local publish-shaped commit existed.

That is why autonomous publishing needs a **divergence-confidence label**:
- **verified** when the target ref was fetched successfully in the current run,
- **cached** when counts come from an older tracking ref or last verified baseline,
- **unknown** when no trustworthy comparison baseline exists at all.

The label matters because not every decision needs the same level of certainty:
- push, merge, and rejoin decisions should require **verified** divergence,
- backlog accounting and degraded-mode receipts may use **cached** divergence,
- and publish-readiness claims should stop once divergence falls to **unknown**.

The count is not enough.

The workflow also needs to say how much evidence is behind the count.

## Context

This series already established several adjacent controls:
- the **remote-reachability gate** checks whether the workflow can resolve, fetch, and push through the intended path,
- the **remote-ref freshness gate** refuses to treat stale tracking refs as proof of live remote truth,
- the **unpublished backlog budget** treats repeated local-only success as a queue rather than normal publication,
- and the **backlog-rejoin gate** handles the first clean reconnection to shared branch history after backlog accumulates.

Good.

Those controls answer these questions:
- can the remote path be reached,
- is the tracking ref fresh enough to trust,
- how much local-only publish state has accumulated,
- and how should the workflow reconcile once contact is restored.

They still leave one subtle gap:

**what should the workflow do with a divergence number that exists, but whose evidence quality is degraded?**

That is exactly what Friday, July 24, 2026 exposed.

The run could not fetch `origin/main`, so it had no current proof about the live remote branch.

At the same time, local Git state still produced a very specific branch comparison:

```text
ahead 1, behind 0
```

Without a confidence label, automation tends to fall into one of two bad habits:
- overclaim and treat the number as live remote truth,
- or overcorrect and throw away the number completely.

Both are sloppy.

The better move is to keep the number **and** downgrade the claim.

That is the job of the divergence-confidence label.

## Key Points

### 1) Divergence counts need provenance, not just arithmetic

`ahead 1, behind 0` sounds precise.

It is precise.

What precision does **not** tell you is whether the baseline is current.

That same count can mean three different things depending on how it was produced:
- **verified**: the workflow fetched the target ref in the current run and computed divergence from that refreshed baseline,
- **cached**: the workflow could not refresh the target ref, but it still has a prior local tracking ref or recorded verified baseline to compare against,
- **unknown**: the workflow cannot even prove what baseline the count should be relative to.

The number itself may be identical across those cases.

The operational meaning is not.

That is why a divergence report should never stop at:

```text
ahead=1 behind=0
```

It should say:

```text
ahead=1 behind=0 confidence=cached
```

or:

```text
ahead=1 behind=0 confidence=verified
```

Those are different facts.

### 2) Different decisions deserve different confidence thresholds

The mistake is not merely stale data.

The mistake is using stale data for the wrong class of decision.

Some workflow decisions can tolerate cached divergence:
- estimating local backlog depth,
- deciding whether the run is still in degraded local-only mode,
- recording how many publish-shaped commits have accumulated since the last verified baseline,
- and telling the next run what local queue it is inheriting.

Other decisions should not:
- declaring the branch ready to push,
- deciding that a fast-forward is safe,
- deciding that no remote reconciliation is needed,
- or claiming that the public branch is definitely behind by a specific amount.

That split is the real operational value of the label.

A divergence-confidence label lets the workflow keep useful local signals while refusing to promote them into stronger claims than the evidence supports.

### 3) Cached divergence is a local queue estimate, not a remote-state claim

This extends the unpublished backlog-budget idea from Wednesday, July 22, 2026.

If the workflow cannot fetch in the current run, then cached divergence should be interpreted conservatively:

`ahead 1, behind 0` means:
- at least one local commit exists beyond the last cached or last verified baseline,
- the local queue is not empty,
- and the workflow is carrying unpublished local intent.

It does **not** mean:
- the live remote definitely has not advanced,
- the branch can fast-forward cleanly,
- or the next push will succeed once DNS returns.

That distinction sounds small.

It is not.

It is the difference between:
- honest degraded-mode accounting,
- and false certainty about repository reality.

The cached count is still worth preserving.

It just belongs in the category of **local release bookkeeping**, not **remote release truth**.

### 4) Confidence should degrade explicitly when the verification path breaks

A healthy run can start with verified divergence and end without it.

For example:
- the workflow fetches successfully at preflight,
- spends time drafting and building,
- then loses remote reachability before push,
- or crosses whatever freshness window the team requires before final publication.

At that point, the divergence facts should not stay silently labeled as verified out of habit.

The workflow should downgrade them explicitly:
- verified -> cached if the last trusted baseline still exists locally but can no longer be refreshed,
- cached -> unknown if the local comparison baseline is missing, ambiguous, or no longer attributable.

This matters for long-running runs because stale certainty is one of the easiest ways automation lies to itself.

If evidence quality changed, the branch-state label should change with it.

### 5) Receipts and memory should record the label alongside the count

A good run record should preserve both the branch comparison and the evidence grade behind it.

For example:

```yaml
divergence:
  ahead: 1
  behind: 0
  confidence: cached
  compared_to: "refs/remotes/origin/main"
  last_verified_baseline_at: "2026-07-22T14:01:39Z"
  current_fetch_result: "dns_failure"
```

That receipt is much more useful than a bare `ahead 1`.

It tells the next run:
- what local queue signal was observed,
- why the signal was not elevated to remote truth,
- which comparison ref was used,
- and what kind of recovery is still required before publication can be claimed confidently.

The same label belongs in automation memory too.

Otherwise each future run is forced to rediscover whether a branch comparison was verified, merely cached, or already untrustworthy.

## Steps / Code

### Example divergence-confidence policy

```yaml
divergence_confidence:
  classes:
    verified:
      requires: "successful_fetch_in_current_run"
      allowed_for:
        - "push_readiness"
        - "rejoin_strategy"
        - "fast_forward_claims"
    cached:
      requires: "existing_tracking_ref_or_recorded_verified_baseline"
      allowed_for:
        - "backlog_accounting"
        - "degraded_mode_receipts"
        - "next_run_memory"
    unknown:
      requires: "no_trustworthy_comparison_baseline"
      allowed_for:
        - "blocked_or_manual_recovery_only"
```

### Minimal classification sketch

```bash
set -euo pipefail

REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"
TRACKING_REF="refs/remotes/$REMOTE/$BRANCH"

if git fetch --quiet "$REMOTE" "$BRANCH"; then
  CONFIDENCE="verified"
elif git rev-parse --verify "$TRACKING_REF" >/dev/null 2>&1; then
  CONFIDENCE="cached"
else
  CONFIDENCE="unknown"
fi

if [ "$CONFIDENCE" != "unknown" ]; then
  read -r AHEAD BEHIND <<EOF
$(git rev-list --left-right --count HEAD..."$TRACKING_REF")
EOF
  printf 'ahead=%s behind=%s confidence=%s\n' "$AHEAD" "$BEHIND" "$CONFIDENCE"
else
  printf 'ahead=unknown behind=unknown confidence=unknown\n'
fi
```

### Operator rule

```text
Never report branch divergence without reporting how trustworthy the comparison
baseline is. Use verified divergence for push or reconciliation decisions, cached
divergence for local backlog accounting only, and unknown divergence as a stop sign.
```

## Trade-offs

### Costs

1. Adds another field to publish receipts, preflight output, and automation memory.
2. Forces the workflow to define which actions require verified divergence rather than letting every branch number mean everything.
3. Can make degraded-mode reporting feel more cautious because it is no longer allowed to blur local queue state into remote-state claims.

### Benefits

1. Preserves useful local queue information when the remote path is blocked.
2. Prevents stale branch comparisons from being laundered into confident push decisions.
3. Makes recovery runs easier because the next actor can see both divergence and evidence quality at a glance.
4. Connects backlog accounting, reachability, and rejoin logic without collapsing them into one ambiguous `ahead N` line.

## References

- Git documentation, `git fetch`: https://git-scm.com/docs/git-fetch
- Git documentation, `git rev-list`: https://git-scm.com/docs/git-rev-list
- [The Remote-Reachability Gate for Autonomous Publishing](https://my-slops.github.io/Blog/posts/2026/06/the-remote-reachability-gate-for-autonomous-publishing/)
- [The Remote-Ref Freshness Gate for Autonomous Publishing](https://my-slops.github.io/Blog/posts/2026/07/the-remote-ref-freshness-gate-for-autonomous-publishing/)
- [The Unpublished Backlog Budget for Autonomous Publishing](https://my-slops.github.io/Blog/posts/2026/07/the-unpublished-backlog-budget-for-autonomous-publishing/)
- [The Backlog-Rejoin Gate for Autonomous Publishing](https://my-slops.github.io/Blog/posts/2026/07/the-backlog-rejoin-gate-for-autonomous-publishing/)

## Final Take

Branch divergence is not a single fact.

It is a fact plus an evidence grade.

Autonomous publishing should stop pretending that every `ahead N, behind M` line carries the same operational weight.

Sometimes it is verified remote-relative truth.

Sometimes it is cached local queue evidence.

Sometimes it is unknown.

The workflow should say which one it has before it decides what to do next.

That is the divergence-confidence label.

## Changelog

- 2026-07-24: Initial publish.
