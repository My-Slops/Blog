---
title: "A Green Pull Request Does Not Mean the Merge Candidate Was Tested"
date: "2026-10-08"
updated: "2026-10-08"
slug: "a-green-pull-request-does-not-mean-the-merge-candidate-was-tested"
description: "A pull request can pass on its branch and still fail once it is combined with the current base branch or other queued work. A merge queue needs CI on the merge candidate itself."
summary: "Treat pull-request CI and merge-queue CI as different evidence. The first checks a proposed change; the second checks the integration GitHub is actually about to land."
tags: [developer tooling, testing, reliability, automation]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/10/a-green-pull-request-does-not-mean-the-merge-candidate-was-tested/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Pull-request CI answers whether one proposed change passed against the base it was tested with. A merge queue makes a different object: a temporary integration of that pull request, the latest base branch, and sometimes other queued pull requests.

That object needs its own CI result. In GitHub Actions, a workflow that supplies a required check for a merge queue must listen to `merge_group`; a `pull_request` trigger alone does not run for the queued merge candidate. Otherwise, a required check can be absent exactly when GitHub needs it to decide whether to merge.

## Context

Imagine two pull requests that both pass independently.

The first adds a database column and changes an endpoint to write it. The second adds a validation rule that makes the new column required. Each branch was tested against yesterday's `main`, where the other change did not exist. The merge queue combines them with today's `main` and asks CI to test the resulting revision.

That is not redundant work. It is the first test of the revision that could actually land.

GitHub describes a merge queue as creating a temporary merge group from the current base branch and queued pull requests ahead of an entry. The group is merged only after the base branch's required checks pass. [Its merge-queue documentation](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-a-pull-request-with-a-merge-queue) is explicit that a queue may remove a pull request when configured CI reports a failure for that merge group.

The useful distinction is between two pieces of evidence:

| Evidence | What it establishes | What it does not establish |
| --- | --- | --- |
| A green pull request | This change passed in the proposed branch context. | The current integration candidate passes. |
| A green merge group | The concrete revision the queue assembled passed its required checks. | Every possible future combination will pass. |

Calling both results “CI passed” makes a real difference disappear. The subject of the test changed.

## Key Points

### A merge queue changes what CI is validating

Without a queue, teams often reason from a simple relationship:

```text
feature branch + base branch observed during review -> green checks -> merge
```

On a busy branch, the base may move while a pull request is waiting for review, approval, or its turn to merge. A queue replaces that assumption with a candidate that is closer to the eventual production commit:

```text
latest base + queued changes ahead + this pull request -> merge-group checks -> merge
```

The first check remains valuable. It makes feedback fast and local to the author. The second protects the shared branch from interactions that did not exist when the pull request's original checks ran: generated-code conflicts, a changed dependency lockfile, incompatible migrations, fixture assumptions, or simply a test that depends on ordering.

This does not mean a merge group predicts every production problem. It is still bounded by the checks, environments, and data it exercises. It does mean the system has tested the actual integration proposal rather than inferring its safety from a different commit.

### `pull_request` is not an alias for `merge_group`

This is where GitHub Actions configurations often become subtly incomplete. GitHub documents `merge_group` as a separate event. Its event reference says the event exposes the merge group's SHA and ref, and recommends adding it alongside `pull_request` for required checks used by a merge queue.

For a workflow whose `test` job is required in both places, the basic shape is:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  merge_group:
    types: [checks_requested]
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - run: npm ci
      - run: npm test
```

The important part is not the exact job name. It is that the required workflow runs against both subjects. GitHub's [workflow-events reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group) says that a merge-group run receives the merge group's SHA and ref. Let `actions/checkout` use that default context unless there is a deliberate reason to override it; checking out a pull request head in a merge-group run would test the wrong revision again.

GitHub's [required-check troubleshooting guide](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#status-checks-with-github-actions-and-a-merge-queue) makes the failure mode concrete: if a merge queue requires an Actions check, the workflow must include `merge_group`, or the required status check is not reported and the merge fails.

### Audit the assumptions hidden in the workflow

Adding the trigger is necessary, but it is not always sufficient. A workflow written only for pull requests may read fields that do not exist for a merge group, such as `github.event.pull_request.number`, or decide which tests to run from a pull-request diff. Those choices need an explicit merge-group equivalent.

Review these areas before making a check required for the queue:

1. **Checkout target.** Does the test use `github.sha` from the event, rather than forcing a pull-request head SHA?
2. **Event-specific conditionals.** Are jobs that require pull-request metadata limited to `github.event_name == 'pull_request'`? Does the required integration job run for both events?
3. **Changed-file logic.** If expensive checks are selected from a pull-request diff, what is the conservative selection rule for a combined candidate?
4. **Artifacts and reports.** Can upload names, report comments, and deployment previews tolerate a merge-group ref without pretending it is a durable branch?
5. **Required-check identity.** Does the required job keep a stable name and report from the expected integration?

The third question matters more than it appears. A path filter that sensibly skips a documentation-only pull request can be unsafe for a merge group if another queued change alters generated output or a shared build step. GitHub notes that skipped required workflows can leave a check pending; missing checks are a configuration signal, not evidence that no testing was needed.

### Test the queue as a separate delivery path

Do not stop at one green pull request after enabling the setting. Put a harmless change through the queue and inspect the resulting run:

```text
Given: a required CI workflow has both pull_request and merge_group triggers
When: an approved pull request enters the merge queue
Then: a new CI run starts for the merge-group SHA
And: its required job reports with the expected name
And: the queue advances only after that job succeeds

Given: a merge-group-only failure
When: the job fails for the queued candidate
Then: the pull request is removed or held according to queue policy
And: the failure is discoverable without treating the earlier PR check as contradictory
```

The second case is the point of the exercise. A merge-group failure does not prove the pull-request run was wrong; it proves the two runs tested different revisions.

There is a scheduling concern here as well. Testing merge candidates costs more CI and can delay the queue when a group fails. That is a throughput trade-off, not a reason to let a green branch result stand in for integration evidence. As [A Concurrency Group Is a Discard Policy](https://my-slops.github.io/Blog/posts/2026/10/a-concurrency-group-is-a-discard-policy/) argues, workflow scheduling always includes an outcome policy. A merge queue should be equally explicit about what it tests before it decides a change may land.

## Steps / Code

Before enabling or changing a merge queue, answer these operational questions:

1. Which checks are advisory on a pull request, and which are required on the merge candidate?
2. Does every required Actions workflow subscribe to `merge_group`?
3. Which jobs depend on pull-request-only metadata, and what should they do for a merge group?
4. Can the longest required check complete inside the queue's timeout and capacity settings?
5. When a merge-group check fails, can an engineer see the candidate SHA, included pull requests, and failing output?

For a small repository with a quiet base branch, direct merges after up-to-date pull-request checks may be enough. A merge queue earns its cost when integration races are common enough that serializing and testing the candidate saves more human coordination than it consumes in CI time.

## Trade-offs

Merge-group CI is additional work, and the candidate is ephemeral. Avoid publishing it as if it were a reviewable feature branch or attaching durable external state to it without a cleanup policy. Tests that require secrets, protected environments, or third-party callbacks also need a careful threat model; adding a trigger should not broaden what untrusted pull-request code can access.

Queues can also make failures feel less intuitive. A contributor may see a green pull-request check and a red queue result minutes later. The remedy is not to collapse the statuses. Show the candidate SHA and event type, explain that the base or queue composition changed, and make reruns target the same integration context when practical.

My preference is to keep fast pull-request feedback and reserve the full integration suite for the merge candidate when its cost is material. If the suite is cheap, running it in both places buys simpler reasoning. In either case, required checks should be named for the commit they actually tested.

## References

- GitHub Docs, [Merging a pull request with a merge queue](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-a-pull-request-with-a-merge-queue)
- GitHub Docs, [Events that trigger workflows: `merge_group`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group)
- GitHub Docs, [Troubleshooting required status checks: merge queues](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#status-checks-with-github-actions-and-a-merge-queue)
- This repository, [A Concurrency Group Is a Discard Policy](https://my-slops.github.io/Blog/posts/2026/10/a-concurrency-group-is-a-discard-policy/)

## Final Take

A pull request's green check is evidence about a proposed change. A merge queue's green check is evidence about the integration revision it is about to land.

Keep both. Configure each intentionally. Never let the first masquerade as the second.

## Changelog

- 2026-10-08: Initial publish.
