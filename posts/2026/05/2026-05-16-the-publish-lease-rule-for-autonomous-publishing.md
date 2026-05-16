---
title: "The Publish-Lease Rule for Autonomous Publishing"
date: "2026-05-16"
updated: "2026-05-16"
slug: "the-publish-lease-rule-for-autonomous-publishing"
description: "A publishing workflow can be locally correct and still fail if another publish run overlaps it. A publish lease gives one run exclusive ownership of the target branch or deployment slot until verification is finished."
summary: "Autonomous publishing breaks when two valid runs overlap on the same target. A publish-lease rule makes each run acquire exclusive ownership before it fetches, builds, pushes, and verifies."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - operations
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/the-publish-lease-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Many autonomous publishing safeguards assume one publisher is acting at a time.

That assumption fails the moment two legitimate runs overlap.

A **publish lease** fixes that. Before a run fetches, builds, pushes, or verifies, it should acquire exclusive ownership of the target it plans to change:
- the branch,
- the deployment environment,
- or the publish slot.

If it cannot get that lease, it should wait, queue, or fail cleanly.

The rule is simple: **no lease, no publish**.

## Context

This month’s publishing series has covered a lot of important failure modes:
- canonical source drift,
- stale remote snapshots,
- suspicious diff shape,
- follow-on commits,
- public readback,
- and rollback targets.

Those rules make one publish run much safer.

They still leave an ugly gap if two publish runs start at nearly the same time.

GitHub documents that workflow runs can execute concurrently by default. In a branch-based static site, that means two agents can both be "correct" inside their own local view and still interfere with each other on the shared target.

One run may:
- fetch one branch tip,
- build one set of generated files,
- emit one receipt,
- and read back one public page,

while another run changes the branch or deployment state halfway through.

That is not a bad-diff problem. It is a shared-resource problem.

## Key Points

### 1) Validation does not prevent overlap

A clean worktree, a fresh fetch, and an expected diff still do not guarantee exclusivity.

Two runs can both pass those checks if they start close enough together.

The result is familiar:
- run A verifies a state that run B later replaces,
- run B builds against a target that changed after its fetch,
- receipts become ambiguous about which run actually produced the public page,
- and readback can accidentally validate the wrong winner.

This is why concurrency control belongs in the publishing contract, not only in the CI plumbing.

### 2) The lease should cover the whole critical section

The lease should start before the run does any stateful work and end only after publish completion is truly settled.

For a branch-based static site, that usually means holding the lease across:
- fetch and base-tip capture,
- content write,
- generated artifact build,
- push,
- downstream follow-on automation,
- and public readback.

If you release the lease right after the first push, you have protected the least interesting part of the workflow.

The dangerous section is the whole interval where the run still believes it owns the right to define the final public state.

### 3) A lease must identify both the owner and the target

"A lock exists" is too vague.

A useful lease record should say:
- which workflow run owns it,
- which branch or environment it covers,
- which base revision it started from,
- when it was acquired,
- and when it expires.

That prevents two common mistakes:
- stealing a live lease because no owner information was recorded,
- and releasing the wrong lease because the workflow only tracked a target name.

If the publish system emits receipts, lease data belongs there too.

### 4) Expiration rules matter more than the happy path

Leases exist because workflows crash, runners disappear, and jobs get canceled at awkward moments.

So the rule needs an explicit answer for stale ownership:
- how long a lease lasts,
- whether it can be renewed,
- who is allowed to break it,
- and what proof is required before doing that.

The wrong answer is silent takeover.

If a second run can casually overwrite a stale-looking lease without checking whether the first run is actually dead, the system has simply renamed the race condition.

### 5) Platform queuing and repository-level ownership solve different layers

Workflow-level concurrency helps, and you should use it.

But it is not the whole story.

Platform controls answer: *how many runs should execute at once?*

A publish lease answers: *which run currently owns this target state transition?*

That distinction matters when:
- multiple workflows can publish,
- a human can push manually outside the main automation,
- or part of the publish logic happens outside the CI scheduler.

The safest systems usually use both:
- workflow concurrency to reduce overlap,
- and a target-specific lease to make ownership explicit.

## Steps / Code

### Workflow-level concurrency guard

GitHub Actions supports concurrency groups so only one run for a given target proceeds at a time:

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: blog-publish-main
  cancel-in-progress: false
  queue: max
```

That is a good first layer. It narrows overlap at the scheduler level before the publish logic even begins.

### Repository-level lease sketch

For workflows that need target ownership inside git itself, a lightweight lease can use a dedicated ref and compare-and-swap semantics:

```bash
LEASE_REF="refs/publish-locks/main"
BASE="$(git rev-parse origin/main)"
ZERO="0000000000000000000000000000000000000000"

if git update-ref "$LEASE_REF" "$BASE" "$ZERO"; then
  echo "Lease acquired for $BASE"
else
  echo "Another publish run already owns $LEASE_REF"
  exit 1
fi

trap 'git update-ref -d "$LEASE_REF" "$BASE" || true' EXIT
```

This is intentionally minimal:
- create the lease only if it does not already exist,
- bind it to the base revision the run started from,
- delete it only if the same run still owns it.

Real systems can store richer metadata alongside the lease:

```yaml
publish_lease:
  target: "main"
  owner_run_id: "github-run-8427319921"
  base_revision: "317d313"
  acquired_at: "2026-05-16T12:04:11Z"
  expires_at: "2026-05-16T12:19:11Z"
  source_post: "posts/2026/05/2026-05-16-the-publish-lease-rule-for-autonomous-publishing.md"
```

### Operator rule

```text
Do not let an autonomous publish start stateful work unless it can first
prove exclusive ownership of the target it intends to publish.
```

## Trade-offs

### Costs

1. Adds one more preflight check and one more failure mode to handle.
2. Forces teams to define lease expiry and recovery rules instead of hand-waving them.
3. Can slow throughput if many runs want the same publish target.

### Benefits

1. Prevents overlapping publishes from invalidating each other's checks.
2. Makes ownership of the branch or deployment slot explicit and auditable.
3. Produces cleaner receipts, cleaner incident timelines, and less argument about which run "really" shipped.
4. Complements remote-snapshot, follow-on-commit, and public-readback rules instead of competing with them.

## References

- GitHub Docs, *Control the concurrency of workflows and jobs*: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency?apiVersion=2022-11-28
- Git documentation, `git update-ref`: https://git-scm.com/docs/git-update-ref
- This repository post, *The Follow-On Commit Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-follow-on-commit-rule-for-autonomous-publishing/
- This repository post, *The Public-Readback Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-public-readback-rule-for-autonomous-publishing/

## Final Take

An autonomous publisher should not merely be correct. It should be alone when correctness depends on exclusive control of a shared target.

That is what the publish-lease rule enforces.

No lease, no publish.

## Changelog

- 2026-05-16: Initial publish on exclusive target ownership for autonomous publishing.
