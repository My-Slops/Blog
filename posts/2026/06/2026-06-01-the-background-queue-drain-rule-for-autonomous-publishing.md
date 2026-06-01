---
title: "The Background-Queue Drain Rule for Autonomous Publishing"
date: "2026-06-01"
updated: "2026-06-01"
slug: "the-background-queue-drain-rule-for-autonomous-publishing"
description: "A content publish should not stall just because routine automation keeps adding predictable low-risk commits upstream. A background-queue drain rule classifies known background commits, absorbs or waits for them deliberately, and only then rebuilds the publish candidate."
summary: "Autonomous publishing gets noisy when scheduled draft jobs keep moving the branch during a legitimate content release. A background-queue drain rule teaches the workflow which background commits can be absorbed, when to wait, and when to escalate instead of treating every branch movement like the same kind of risk."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - operations
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-background-queue-drain-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

The branch moving underneath a publish is not always a surprise.

Sometimes it is just background automation doing exactly what it was told to do:
- creating a daily draft,
- refreshing generated metadata,
- or landing another low-risk housekeeping commit.

That still matters.

If an autonomous publisher treats every upstream commit as equally dangerous, it either stops too often or starts hiding real differences inside a generic "remote changed" warning.

That is why a workflow needs a **background-queue drain rule**:
- classify known background commit types,
- fetch and inspect them before final build,
- absorb or wait for the safe ones deliberately,
- and escalate when the queue contains anything outside that policy.

The goal is not to ignore branch movement.

The goal is to stop pretending all branch movement means the same thing.

## Context

This repository already has the core pieces for cautious autonomous publishing:
- canonical Markdown sources,
- generated site artifacts,
- scheduled draft creation,
- and a month of workflow rules about clean trees, remote snapshots, expected diffs, publish receipts, and release classes.

That gets you most of the way there.

It does not solve one annoyingly practical problem:

**background automation keeps moving `main` even when nobody made a meaningful publishing decision.**

A scheduled workflow that creates `chore: create daily draft post` commits is a good example.

Those commits are real.

They change the branch tip.

They can invalidate a previously prepared publish candidate.

But they do not carry the same operational meaning as:
- a builder change,
- a manual hotfix,
- or a second content publish.

The remote-snapshot rule already says you should not push a candidate built against an old branch view.

Good.

The missing piece is policy for what to do next when the new commits are expected background noise rather than a surprising product change.

## Key Points

### 1) Remote movement needs classification, not just detection

"The branch changed" is a detection event.

It is not yet a decision.

If the workflow stops there, operators still have to answer:
- what changed,
- who changed it,
- whether it was expected,
- and whether the prepared publish should be rebuilt, delayed, or canceled.

A background-queue drain rule turns that into a policy question instead of a last-minute improvisation.

It asks:

*Did the branch move because of an allowed background commit class, or because something materially new entered the release surface?*

That distinction is the difference between a routine replay and an escalation.

### 2) Known background automations should have explicit commit classes

If your system has recurring low-risk automation, name it up front.

For example:
- daily draft creation,
- feed or search-index refresh jobs,
- timestamp-only metadata refreshes,
- or archival chores that touch well-bounded paths.

Each class needs a concrete policy:
- expected author or workflow,
- expected commit message shape,
- expected file paths,
- and a statement about whether content publishes may absorb it automatically.

Without that contract, "background commit" becomes a hand-wavy excuse to skip review.

That is not a rule. It is a loophole.

### 3) Draining the queue should happen before final review

If the publish candidate is prepared first and reconciled later, review gets blurry.

Now the operator is inspecting:
- the intended post,
- the generated artifacts,
- and a pile of background commits that arrived after the candidate was first validated.

That is backwards.

The workflow should drain the background queue first:
- fetch the current remote tip,
- walk the new commits since the last trusted snapshot,
- verify that every new commit belongs to an allowed background class,
- rebuild the candidate on top of that updated tip,
- then run the normal publish checks.

Review stays cleaner when the candidate already includes the tolerated background state.

### 4) "Drain" should mean absorb, wait, or escalate

A drain rule is not "always replay automatically."

It needs three outcomes.

**Absorb**

If every new commit matches an allowed background class and stays inside approved paths, rebuild on top of the latest remote tip and continue.

**Wait**

If the background workflow is still actively appending commits, pause until the queue settles or a timeout expires. Publishing against a moving conveyor belt is usually self-inflicted pain.

**Escalate**

If even one commit falls outside the policy boundary, stop. A manual edit, a second publish candidate, or a builder change should not sneak through under a background label.

The point is discipline, not optimism.

### 5) Publish receipts should record drained commits

Once the workflow absorbs background commits, the receipt should say so plainly.

Otherwise later responders see:
- the final published commit,
- the source post,
- and a successful build,

but they do not know that the workflow replayed the candidate on top of several scheduled chores first.

A useful receipt should record:
- the original trusted base,
- the drained background commit range,
- the commit classes that were absorbed,
- the rebuilt publish candidate hash,
- and the final public URL.

That keeps routine replay from turning into invisible history.

## Steps / Code

### Example background-queue policy

```yaml
background_queue:
  max_absorb_commits: 5
  settle_timeout_seconds: 180
  allowed_classes:
    - name: daily_draft_creation
      commit_message: "^chore: create daily draft post$"
      paths:
        - "posts/*/*/*-daily-entry.md"
      absorb_into:
        - content_publish
    - name: generated_tag_refresh
      commit_message: "^chore: rebuild tag indexes$"
      paths:
        - "tags/"
      absorb_into: []
```

### Minimal drain check

```bash
SNAPSHOT_REF="${REMOTE_SNAPSHOT_REF:?missing REMOTE_SNAPSHOT_REF}"
REMOTE_REF="origin/main"

git fetch origin main

NEW_COMMITS="$(git rev-list --reverse "${SNAPSHOT_REF}..${REMOTE_REF}")"

for COMMIT in $NEW_COMMITS; do
  SUBJECT="$(git log -1 --format=%s "$COMMIT")"
  CHANGED="$(git diff-tree --no-commit-id --name-only -r "$COMMIT")"

  if printf '%s\n' "$SUBJECT" | rg '^chore: create daily draft post$' >/dev/null &&
     printf '%s\n' "$CHANGED" | rg '^posts/[0-9]{4}/[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}-daily-entry\.md$' >/dev/null; then
    echo "Absorbing allowed background commit $COMMIT"
    continue
  fi

  echo "Escalating unexpected upstream commit $COMMIT ($SUBJECT)"
  exit 1
done

echo "Background queue is safe to absorb; rebuild publish candidate on top of ${REMOTE_REF}"
```

### Operator rule

```text
When the remote branch moves during a publish, do not treat every new commit
as identical risk. Drain only the background commit classes you have already
named, bounded, and approved. Everything else stops the run.
```

## Trade-offs

### Costs

1. Adds another policy surface to maintain alongside release classes and diff boundaries.
2. Can be abused if "background" commit classes are defined too broadly.
3. Introduces waiting and replay logic that makes the publish workflow slightly more complex.

### Benefits

1. Prevents harmless scheduled automation from blocking legitimate content publishes all the time.
2. Keeps remote-drift handling explainable instead of burying different causes under one generic failure.
3. Preserves strict escalation for unexpected upstream commits while still letting the system operate smoothly.
4. Produces better publish receipts because routine replay becomes explicit evidence instead of hidden behavior.

## References

- GitHub Actions workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- Git documentation, `git rev-list`: https://git-scm.com/docs/git-rev-list
- Git documentation, `git diff-tree`: https://git-scm.com/docs/git-diff-tree
- This repository daily draft workflow: https://github.com/My-Slops/Blog/blob/main/.github/workflows/new-daily-post.yml
- This repository daily draft generator: https://github.com/My-Slops/Blog/blob/main/scripts/new-daily-post.mjs

## Final Take

Autonomous publishing gets much less annoying once it learns the difference between a real competing change and routine background traffic.

Detection alone is not enough.

You need a policy that says which background commits can be absorbed, when the run should wait, and where the escalation boundary lives.

If the branch keeps moving, the workflow should not panic.

It should classify.

## Changelog

- 2026-06-01: Initial publish.
