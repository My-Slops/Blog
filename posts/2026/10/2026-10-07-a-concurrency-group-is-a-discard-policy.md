---
title: "A Concurrency Group Is a Discard Policy"
date: "2026-10-07"
updated: "2026-10-07"
slug: "a-concurrency-group-is-a-discard-policy"
description: "Limiting concurrent CI or deployment runs also decides which queued work may be discarded. Make that replacement policy explicit before putting unrelated operations in the same group."
summary: "A concurrency group is not merely a resource limit. It defines whether later work replaces earlier work, whether an in-progress operation can be interrupted, and which commit never receives a result."
tags: [developer tooling, reliability, deployment, automation]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/a-concurrency-group-is-a-discard-policy/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

Two pushes arrive while a staging deployment is still running.

The first deploys commit `a1`. The second queues `b2`. The third queues `c3`. An engineer sees a concurrency setting and assumes it means: “only one deployment happens at a time.” That is only half of the policy. The other half is: “which request is allowed to disappear?”

In GitHub Actions, a concurrency group permits one running job or workflow and, by default, one pending one. When another run enters the same group, the existing pending run is cancelled and replaced. With `cancel-in-progress: true`, a new run can cancel the one already running as well. [GitHub’s workflow syntax reference](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency) documents both behaviors.

For a preview build, replacing `b2` with `c3` is usually exactly right. For a migration, a release artifact, or a job that notifies an external customer, silently deciding that `b2` never needs an outcome can be a production bug.

## The useful question is not “should this run concurrently?”

Ask whether a newer request supersedes an older one.

Those are different questions. A staging environment may accept only one deployment at a time because two simultaneous writes would conflict. That establishes a mutual-exclusion requirement. It does not yet establish whether a newer deployment should replace a queued one, wait behind it, or be rejected.

| Kind of work | Sensible policy | Why |
| --- | --- | --- |
| Rebuild a pull-request preview | Latest request wins | The newest commit is the only preview anyone needs. |
| Publish a static site from `main` | Often latest request wins | An intermediate site revision has little value if a newer commit supersedes it. |
| Produce a versioned release artifact | Preserve every accepted request | Each version may be an input to a later release, audit, or customer download. |
| Apply a customer-requested data change | Preserve or explicitly reject | A later request does not necessarily make the earlier business action obsolete. |
| Run an expensive report refresh | Domain-specific | A refresh may be replaceable; a report promised to a user may not be. |

“Latest wins” is not a generic reliability improvement. It is a claim about intent. Make it only when the new request really makes the old request unnecessary.

## A cancellation is an outcome, not an implementation detail

The dangerous case is not the obvious one where a queued run is replaced. It is an interrupted run that already changed something.

Consider this workflow shape:

```yaml
concurrency:
  group: staging-deploy
  cancel-in-progress: true
```

This may be a good choice for a long-running test suite, where a new commit makes the old test result uninteresting. It is much less comfortable for a deployment that has already uploaded assets, changed traffic, or started a migration. Cancelling the workflow does not roll back an external side effect. It only stops the workflow according to the runner’s cancellation behavior.

Treat `cancelled` as a first-class terminal state in the release record. An operator should be able to answer all three of these questions without reading raw runner logs:

1. Which commit was being deployed?
2. What externally visible steps had completed before cancellation?
3. What reconciles the target before the next run begins?

If the answer to the third question is “the next run probably overwrites it,” the concurrency group is covering an incomplete deployment protocol. That can be acceptable for an idempotent static upload. It is not a sound default for operations that cannot safely be replayed.

This is the same boundary behind [A Feature Flag Does Not Undo an Irrevocable Change](https://my-slops.github.io/Blog/posts/2026/09/a-feature-flag-does-not-undo-an-irrevocable-change/): stopping future code paths is different from reversing an effect already produced by a previous one.

## Scope groups to the resource, not to a vague activity

`deploy` is usually too broad. It can serialize unrelated services and hide the fact that their target resources do not conflict. `main` is often too narrow in the other direction: it may allow two workflows to act on the same environment because their group names differ.

A useful group name identifies the resource that requires coordination:

```yaml
concurrency:
  group: deploy-${{ inputs.service }}-${{ inputs.environment }}
  cancel-in-progress: false
```

That configuration says the exclusion boundary is one service in one environment. It does **not** say that deployments should be discarded; `cancel-in-progress: false` avoids interrupting the run that currently owns the target. The remaining queue policy still needs to match the domain. If every accepted deployment must run, use a queueing mechanism that preserves them rather than assuming a concurrency key does.

Do not reuse a group across unrelated workflows merely because their names look similar. GitHub notes that concurrency group names must be unique across workflows when runs should not cancel each other. A shared `production` group can be intentional coordination; a shared `deploy` group for unrelated repositories or services is accidental coupling with cancellation attached.

## Test the policy with three commits, not one green run

Concurrency configuration is hard to review from YAML alone because the important behavior appears only under overlap. Exercise it deliberately:

```text
Given: commit A is running in the deployment group
When: commits B and C enter that group before A finishes
Then: record whether B was cancelled, queued, or executed
And: verify the final target is the expected revision
And: verify every cancelled run leaves an inspectable outcome

Given: A has completed its first external side effect
When: it is cancelled by a newer run
Then: the next run reconciles that effect before continuing
```

The first test checks scheduling. The second checks whether scheduling has been mistaken for recovery. Both matter. A system can consistently choose the newest run and still leave the environment halfway through the older one.

For agent-operated workflows, expose this distinction in tool output too. “Deployment cancelled because a newer revision superseded it” is a useful result. “Deployment failed” is misleading, and “deployment complete” is worse if only the newer run eventually succeeded. [Starting a Job Is Not the Same as Finishing It](https://my-slops.github.io/Blog/posts/2026/10/starting-a-job-is-not-the-same-as-finishing-it/) covers why an agent needs that honest lifecycle boundary.

## Keep the cheap optimization where it belongs

Discarding obsolete work saves runner time and shortens feedback loops. It is a particularly good fit for lint, preview builds, generated documentation, and other calculations whose only useful answer is the one for the newest source tree. Running every intermediate commit there is often wasteful theater.

But “newest source wins” is not the same as “newest side effect wins.” If work creates a versioned artifact, sends a promise to someone outside the system, advances a state machine, or must be accounted for individually, use an explicit queue or a domain-level deduplication rule instead. Its lifecycle needs an identity and a visible decision about why it ran, waited, was rejected, or was superseded.

## References

- GitHub Docs, [Workflow syntax for GitHub Actions: `concurrency`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)
- This blog, [A Feature Flag Does Not Undo an Irrevocable Change](https://my-slops.github.io/Blog/posts/2026/09/a-feature-flag-does-not-undo-an-irrevocable-change/)
- This blog, [Starting a Job Is Not the Same as Finishing It](https://my-slops.github.io/Blog/posts/2026/10/starting-a-job-is-not-the-same-as-finishing-it/)

## Final Take

Concurrency is a scheduling policy plus a replacement policy. Before adding a group, state what makes a request obsolete, what cancellation leaves behind, and where a discarded request is recorded. If those answers are unclear, the work is not ready to be silently replaced.

## Changelog

- 2026-10-07: Initial publication.
