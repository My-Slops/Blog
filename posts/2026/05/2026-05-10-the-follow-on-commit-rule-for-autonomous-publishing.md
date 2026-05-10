---
title: "The Follow-On Commit Rule for Autonomous Publishing"
date: "2026-05-10"
updated: "2026-05-10"
slug: "the-follow-on-commit-rule-for-autonomous-publishing"
description: "If a publish push triggers another automation that commits generated output, the first commit is not the final public state. A follow-on commit rule forces the workflow to reconcile intent against the last downstream commit."
summary: "In branch-based publishing pipelines, the commit that starts the publish is not always the commit readers get. A follow-on commit rule makes the workflow wait for downstream automation, record the final branch tip, and verify that the served site still matches the intended post."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - operations
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/2026-05-10-the-follow-on-commit-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

In an autonomous publishing pipeline, the commit that starts the publish is not always the commit readers ultimately get.

If a push triggers another workflow that:
- rebuilds generated files,
- commits rendered output,
- or performs the actual deployment,

then the original publish commit is only a provisional state.

The safer rule is:
- record the initiating commit,
- wait for downstream automation to finish,
- capture the final branch or deployment commit,
- reconcile that final state against the intended post and URL.

That is the **follow-on commit rule**: a publish is not complete until the last automation-generated commit or deployment artifact still matches the original publish intent.

## Context

Many autonomous publishing systems look simpler than they really are.

At first glance the flow appears to be:
- create the post,
- commit it,
- push it,
- done.

But branch-based static publishing often adds another hidden step. The push may trigger automation that:
- regenerates HTML pages,
- updates feeds or indexes,
- writes tag catalogs,
- or creates a deployment record after the source commit already landed.

Now the repository has two meaningful moments:
- the **initiating commit** that requested the publish,
- the **follow-on result** produced by downstream automation.

Those are not guaranteed to be identical.

If the workflow creates a second commit, then readers, reviewers, and operators may all be looking at a branch tip that the original publish receipt never mentioned. If the workflow deploys an artifact instead of writing a second commit, the same problem appears under a different name: the served site may reflect a later build result than the one the agent originally verified.

The risk is not theoretical. A downstream job can fail, introduce unexpected file churn, or produce a site that no longer cleanly matches the source post the agent thought it shipped.

## Key Points

### 1) The first push may be only a publish request

In multi-step pipelines, the first push is sometimes just the event that asks the rest of the system to continue.

That means the initial commit is not yet the final public state. It is the start of the publish, not necessarily the end of it.

This matters because many agent workflows stop their reasoning too early. They treat "push succeeded" as synonymous with "publish succeeded." In a follow-on workflow, that is incomplete.

### 2) Downstream automation creates a second trust boundary

The moment another workflow starts modifying output, the system crosses a new boundary.

Now you are trusting not only:
- the drafting logic,
- the build result,
- and the original diff,

but also:
- the downstream workflow trigger,
- the downstream build inputs,
- the downstream changed-file set,
- and the final branch or deployment state.

That second boundary deserves explicit verification. Otherwise the pipeline can drift after the agent already announced success.

### 3) Receipts should distinguish initiating commit from final commit

Yesterday's receipt pattern still helps, but it needs one more field in workflows like this.

A good publish record should separate:
- the **initiating commit** created by the agent or author,
- the **final commit** or deployment revision produced after downstream automation,
- and the relationship between them.

Without that distinction, the receipt can accidentally describe an intermediate state as if it were the shipped one.

### 4) Reconciliation should compare intent, final tip, and live URL

The reconciliation step is where the rule becomes operational.

At minimum, the workflow should compare three things:
- the intended canonical source post,
- the final branch tip or deployment artifact after downstream automation,
- the public URL expected to serve the post.

The questions are straightforward:
- did the intended source still survive unchanged,
- did the downstream diff stay within the expected file set,
- did the public page resolve to the expected content and path.

If any answer is unclear, the publish is not finished yet.

### 5) "Completed" should mean downstream completion, not local momentum

This is the discipline change most teams need.

A publish run should not mark itself complete merely because it pushed the initiating commit and triggered the next workflow successfully.

Completion should mean one of two things:
1. the downstream workflow finished and the final state reconciled cleanly, or
2. the workflow timed out and escalated with enough evidence for a human to finish the investigation.

That keeps success tied to what readers actually receive, not to the last step the initiating agent personally performed.

## Steps / Code

### Minimal follow-on commit record

```yaml
publish_receipt:
  source_post: "posts/2026/05/2026-05-10-the-follow-on-commit-rule-for-autonomous-publishing.md"
  initiating_commit: "abc1234"
  downstream_workflow: "build-index.yml"
  final_branch_tip: "def5678"
  expected_public_url: "https://my-slops.github.io/Blog/posts/2026/05/the-follow-on-commit-rule-for-autonomous-publishing/"
  reconciled: true
  reconciliation_checks:
    - "source post present at final tip"
    - "downstream diff stayed within expected generated files"
    - "public URL resolved to expected page"
```

### Minimal reconciliation check

```bash
INITIATING_COMMIT="$(git rev-parse HEAD)"

# push happens here

git fetch origin main
FINAL_TIP="$(git rev-parse origin/main)"

if [ "$FINAL_TIP" != "$INITIATING_COMMIT" ]; then
  echo "Follow-on commit detected; review downstream result"
  git diff --name-only "$INITIATING_COMMIT" "$FINAL_TIP"
fi
```

### Operator rule

```text
If another workflow can still change repository or deployment state after your push,
the publish is not complete when your push returns.
```

## Trade-offs

### Costs

1. Adds waiting and one more verification pass after push.
2. Forces workflows to expose downstream status instead of hiding it behind "eventually consistent" language.
3. Creates more bookkeeping in receipts and logs.

### Benefits

1. Prevents intermediate commits from being mistaken for final shipped state.
2. Makes downstream build failures visible before the workflow claims success.
3. Keeps receipts, diffs, and public URLs tied to the same final artifact.
4. Gives humans a cleaner audit trail when automation chains more than one publish step.

## References

- GitHub Docs, *Using custom workflows with GitHub Pages*: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Docs, *Viewing deployment history*: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/view-deployment-history
- This repository build workflow: https://github.com/My-Slops/Blog/blob/main/.github/workflows/build-index.yml

## Final Take

In autonomous publishing, "my commit landed" is not the same as "the final site state is now correct."

If downstream automation can still mutate the outcome, then your first commit is only a request.

Wait for the follow-on result. Reconcile it. Then call the publish complete.

That is the follow-on commit rule.

## Changelog

- 2026-05-10: Initial publish on follow-on commit reconciliation for autonomous publishing.
