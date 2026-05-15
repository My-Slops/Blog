---
title: "The Last-Known-Good Rule for Autonomous Publishing"
date: "2026-05-15"
updated: "2026-05-15"
slug: "the-last-known-good-rule-for-autonomous-publishing"
description: "A publishing agent should record the last known-good repository and public state before it ships anything new. Without that recovery target, failed publishes turn rollback into improvisation."
summary: "Readback can tell an autonomous publisher that the live page is wrong. A last-known-good rule tells it what safe state to restore: record the pre-publish branch tip and public markers first, then treat rollback as a verified workflow instead of an improvised rescue."
tags:
  - ai agents
  - publishing
  - rollback
  - reliability
  - operations
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/the-last-known-good-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Verification is not enough if the workflow has no clear state to fall back to.

Before an autonomous publisher ships a new post, it should record the **last known-good** state:
- the remote branch tip it started from,
- the public URL or homepage markers it confirmed were correct,
- the recovery method that can restore that exact state if the publish goes bad.

That is the **last-known-good rule**: every publish should begin by naming the state it will return to if post-publish verification fails.

If you detect a bad publish but never defined the safe state before it, you are already improvising the rollback.

## Context

The recent publishing rules in this repo point toward an obvious operational gap.

The workflow now knows how to:
- start from canonical sources,
- bind to the current remote snapshot,
- reject suspicious diff shape,
- wait for follow-on commits,
- and read back the public page after publish.

That is a solid detection stack.

Detection alone does not finish the job.

If the public readback keeps failing, operators still need an answer to a blunt question:

*What exact state are we trying to get back to?*

Too many systems answer that question in the middle of the incident, from memory, under time pressure.

That is sloppy for humans and worse for agents. A publishing agent should not discover its rollback target only after the publish has already gone sideways.

## Key Points

### 1) A rollback target should be defined before the publish exists

Once a broken publish is live, everything feels urgent.

That is exactly the wrong moment to debate:
- which commit counted as the previous good state,
- whether the homepage had already updated,
- whether a downstream automation changed the branch tip,
- or which public page contents proved the old state was actually healthy.

The workflow should decide that up front.

Recording the last-known-good state before publish is the operational equivalent of labeling the fire exit before the smoke appears.

### 2) "Last known-good" means repository state and public state together

A branch hash by itself is not enough.

The repo may say one thing while the served site still says another. That was the whole point of the public-readback rule.

So the last-known-good record should bind together:
- the remote branch tip or deployment revision,
- the URL expected to represent healthy public state,
- one or two markers proving that page identity,
- and the time that verification was observed.

That makes rollback target selection less sentimental and more factual.

### 3) Recovery should restore the canonical state, not hand-patch symptoms

If the workflow decides it must roll back, it should recover the same way a trustworthy publish works:
- restore the known-good canonical source state,
- regenerate derived artifacts from that state,
- publish the recovery result,
- verify the public page again.

What it should not do is patch a few generated files in a panic because the live page looks wrong.

A rollback that bypasses the canonical-source rule often creates a second incident while pretending to fix the first one.

### 4) The recovery target should survive follow-on automation

This matters in branch-based static publishing.

If the initial publish commit triggers another workflow that rewrites generated files or creates the final deployed artifact, the last-known-good record should still point to the state before all of that started.

Otherwise the system can confuse:
- the initiating commit,
- the downstream follow-on result,
- and the previous stable state that readers were actually getting before the new publish began.

A useful rollback target is anchored to the last stable result, not merely to the last interesting event in git history.

### 5) Rollback is incomplete until the public state is re-verified

A reverted commit is not the same thing as a restored site.

The recovery workflow should prove:
- the rollback commit or restored branch state matches the recorded target,
- the expected public URL now serves the previous known-good markers again,
- and the incident log says when healthy public state was re-established.

This keeps rollback honest.

Otherwise teams end up celebrating the action they took instead of the state they recovered.

## Steps / Code

### Minimal last-known-good record

```yaml
publish_guard:
  source_post: "posts/2026/05/2026-05-15-the-last-known-good-rule-for-autonomous-publishing.md"
  last_known_good:
    remote_tip_before_publish: "abc1234"
    public_url_checked: "https://my-slops.github.io/Blog/"
    observed_marker: "The Public-Readback Rule for Autonomous Publishing"
    checked_at: "2026-05-15T13:58:11Z"
    recovery_strategy: "restore canonical source state from recorded remote tip and rebuild"
```

### Capture the rollback target before publish

```bash
git fetch origin main
LAST_KNOWN_GOOD="$(git rev-parse origin/main)"
PUBLIC_URL="https://my-slops.github.io/Blog/"
EXPECTED_MARKER="The Public-Readback Rule for Autonomous Publishing"

html="$(curl -fsSL "$PUBLIC_URL")"

if ! printf '%s' "$html" | grep -Fq "$EXPECTED_MARKER"; then
  echo "Cannot confirm last-known-good public state"
  exit 1
fi

echo "Recorded last-known-good commit: $LAST_KNOWN_GOOD"
```

### Operator rule

```text
Do not start an autonomous publish unless you can name the exact state
you will restore if the new publish fails verification.
```

## Trade-offs

### Costs

1. Adds one more pre-publish record and one more mental model to maintain.
2. Forces the workflow to distinguish "current branch tip" from "last stable public state."
3. Makes rollback logic more explicit, which can expose weak spots teams were previously ignoring.

### Benefits

1. Removes guesswork from rollback decisions when public verification fails.
2. Keeps recovery tied to a known-good canonical state instead of ad hoc generated-file edits.
3. Gives incident logs a concrete before-state, not just a story about the bad publish.
4. Makes post-publish verification and rollback part of one coherent workflow.

## References

- Git documentation, `git revert`: https://git-scm.com/docs/git-revert
- GitHub Docs, *Viewing deployment history*: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/view-deployment-history
- This repository post, *The Public-Readback Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-public-readback-rule-for-autonomous-publishing/

## Final Take

Readback tells you when a publish failed.

The last-known-good rule tells you what "fixed" looks like before the failure begins.

That is the difference between rollback as a workflow and rollback as a scramble.

## Changelog

- 2026-05-15: Initial publish on recording last-known-good rollback targets for autonomous publishing.
