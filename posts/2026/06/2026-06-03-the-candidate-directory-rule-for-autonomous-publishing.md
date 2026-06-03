---
title: "The Candidate-Directory Rule for Autonomous Publishing"
date: "2026-06-03"
updated: "2026-06-03"
slug: "the-candidate-directory-rule-for-autonomous-publishing"
description: "A publish workflow gets harder to trust when build steps rewrite tracked site files in place before the release candidate is fully reviewed. A candidate-directory rule makes agents build into an isolated directory, verify that exact output, and promote it only after the checks pass."
summary: "Autonomous publishing stays cleaner when generators build into an isolated candidate directory instead of mutating tracked publish paths during the run. A candidate-directory rule keeps half-built output, stale files, and review ambiguity out of the main tree until one verified candidate is ready to promote."
tags:
  - ai agents
  - publishing
  - workflow
  - release-engineering
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-candidate-directory-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

An autonomous publisher should not treat the tracked site tree as a scratchpad.

If the workflow writes directly into:
- `index.html`,
- `index.json`,
- `rss.xml`,
- `sitemap.xml`,
- or rendered post directories,

before it has finished validation, then the repository spends part of the run in an ambiguous state:
- some files reflect the new candidate,
- some still reflect the old site,
- and stale output can survive longer than anyone intended.

That is why a workflow needs a **candidate-directory rule**:
- build the next site into an isolated directory,
- run validation and review against that exact candidate,
- and promote the candidate into tracked publish paths only once the run is ready to finish.

Do not let the live tree become the place where the workflow experiments.

## Context

May's publishing series covered several useful boundaries:
- start from the canonical source,
- compare against the expected diff,
- keep the worktree clean,
- record a publish receipt,
- verify repeatability,
- fingerprint the builder,
- and refuse mixed builder plus content releases.

Those controls answer important questions.

They still leave one awkward implementation habit untouched:

**building straight into the tracked publish tree while the run is still thinking.**

That habit creates a strange middle state.

During the run, the repository may contain:
- a new `index.json`,
- an updated homepage,
- a partially refreshed tag set,
- one rendered post page,
- and old output that has not been cleaned up yet.

Maybe the workflow will finish and everything will line up.

Maybe it will fail halfway through and leave a confusing local tree behind.

Maybe the agent will review artifacts that are still changing under its feet.

The point is not that every in-place build fails.

The point is that in-place build mutation makes the candidate harder to reason about than it needs to be.

## Key Points

### 1) A release candidate should exist as one inspectable object

The workflow needs a crisp answer to a basic question:

*What exactly are we about to publish?*

That answer gets weaker when the candidate is "whatever the tracked tree currently looks like after several build steps."

A candidate directory gives the run a concrete object:
- one directory,
- one generated site snapshot,
- one artifact set to review,
- one thing to compare, hash, diff, or archive.

That is much easier to trust than a moving target.

### 2) Isolation prevents half-built state from contaminating review

Review should happen against stable output, not against files that might still be rewritten by the next script.

When a workflow builds in place, checks often observe the side effects of build order:
- the homepage may already be updated while feed generation has not run,
- tag indexes may reflect the new post before sitemap generation finishes,
- cleanup may remove obsolete files only at the end,
- and a failed run can leave residue that the next run has to explain.

A candidate directory keeps those transitional states private.

The tracked tree should see either:
- the old known state,
- or the fully prepared new candidate.

The messy middle belongs somewhere else.

### 3) Candidate promotion is a different action from candidate generation

Teams often blur these together because static sites feel cheap to rebuild.

They are still different actions.

Candidate generation asks:
- did the source render,
- did the indexes update correctly,
- did the diff shape stay inside policy,
- did the build repeat cleanly.

Candidate promotion asks something else:
- is this exact output approved to replace the tracked publish state now.

Once those are treated as separate steps, the workflow becomes easier to explain and easier to stop safely.

### 4) Stale-file cleanup gets more honest in an isolated directory

Stale output is one of the boring ways static publishing goes wrong.

If a slug changes, a tag disappears, or a page should be removed, an in-place build can accidentally preserve leftovers unless cleanup is perfect.

An isolated candidate directory makes the intended output explicit:
- if a file is present in the candidate, it belongs in the next publish,
- if it is absent from the candidate, it should not survive promotion.

That is cleaner than asking the live tree to remember what should have been deleted.

### 5) The rule sharpens every later control

The candidate-directory rule does not replace expected-diff checks, publish receipts, or repeatable builds.

It improves them.

Those controls work better when they inspect one frozen candidate instead of a tree that the builder is still mutating.

This is the deeper pattern:

**trust increases when generation happens off to the side and promotion happens only after evidence is complete.**

## Steps / Code

### Minimal candidate-directory flow

```bash
set -euo pipefail

ROOT="$(pwd)"
CANDIDATE_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$CANDIDATE_DIR"
}
trap cleanup EXIT

rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  "$ROOT/" "$CANDIDATE_DIR/"

(
  cd "$CANDIDATE_DIR" || exit 1
  npm ci
  npm run build
)

# Review and validation happen against $CANDIDATE_DIR, not the tracked tree.
diff -ru "$ROOT" "$CANDIDATE_DIR" || true
```

### Promotion step

```bash
rsync -a --delete \
  "$CANDIDATE_DIR/" "$ROOT/"
```

### Operator rule

```text
Generate the next publish candidate outside the tracked publish tree.
Promote one reviewed candidate in one deliberate step.
```

## Trade-offs

### Costs

1. Uses more disk and build time because the workflow now keeps a separate candidate copy.
2. Forces the automation to define a promotion step instead of treating build side effects as the release itself.
3. Makes some local scripts feel less convenient if they were written around in-place mutation.

### Benefits

1. Keeps half-built output and stale-file residue out of the tracked publish tree.
2. Gives review, hashing, and diff checks one stable candidate to inspect.
3. Makes failed runs easier to discard because the old tracked state remains intact until promotion.
4. Reduces ambiguity about whether a weird file came from the candidate, the previous tree, or leftover local state.

## References

- Git documentation, `git worktree`: https://git-scm.com/docs/git-worktree
- `rsync` manual: https://download.samba.org/pub/rsync/rsync.1
- GitHub Docs, About GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- This repository README: https://github.com/My-Slops/Blog

## Final Take

Autonomous publishing gets easier to trust when the builder stops scribbling directly on the tracked site tree.

Build the candidate off to the side. Review that exact output. Promote it once.

That is the candidate-directory rule.

## Changelog

- 2026-06-03: Initial publish on isolated candidate directories for autonomous publishing.
