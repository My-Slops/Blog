---
title: "The Materialized-Checkout Rule for Autonomous Publishing"
date: "2026-06-10"
updated: "2026-06-10"
slug: "the-materialized-checkout-rule-for-autonomous-publishing"
description: "A publish workflow can point at a plausible commit and still build from the wrong filesystem state if the checkout on disk is stale, partial, or otherwise not the tree it claims to represent. A materialized-checkout rule verifies the actual files before build and recreates the workspace instead of trusting metadata alone."
summary: "Autonomous publishing should not trust `HEAD`, branch names, or worktree metadata by themselves. A materialized-checkout rule proves the expected source tree actually exists on disk before build, and falls back to a fresh checkout when the workspace shape does not match the source snapshot."
tags:
  - ai agents
  - publishing
  - workflow
  - release-engineering
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-materialized-checkout-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

An autonomous publisher should not trust repository metadata by itself.

`HEAD` can look fine.

The branch name can look fine.

The worktree can even appear clean.

And the files on disk can still be the wrong tree to build from:
- stale checkout contents,
- missing directories,
- partial restores,
- broken worktree state,
- or a reused workspace that no longer matches the source snapshot it claims to represent.

That is why a workflow needs a **materialized-checkout rule**:
- decide the source snapshot first,
- verify that the expected filesystem tree is actually present on disk,
- refuse to build if required paths are missing or mismatched,
- and recreate the checkout instead of explaining the inconsistency away.

If the workflow cannot prove what tree it has materialized locally, it is not ready to publish from it.

## Context

This publishing series has spent a lot of time on the release path after source selection:
- remote snapshots,
- clean worktrees,
- expected diffs,
- candidate directories,
- manifests,
- candidate identity,
- and sealed release artifacts.

Good.

Those controls matter.

They still assume a quiet precondition that is easier to violate than it sounds:

**the files on disk actually correspond to the source tree the workflow thinks it is using.**

That assumption breaks in boring, practical ways:
- a detached worktree points at an older commit than the operator expects,
- a cache restore brings back a partial repository tree,
- a workspace mount reuses old files under new metadata,
- generated directories are present but the current source content is not,
- or a failed earlier run leaves a checkout in a shape that still looks superficially usable.

This is different from a dirty worktree.

A dirty worktree means tracked files changed.

A materialization failure means the workspace itself is not the source snapshot the workflow thinks it is holding.

That is worse, because the system may start building with confidence it has not earned.

## Key Points

### 1) Source identity and checkout reality are different questions

Teams often ask:

*What commit are we on?*

That is necessary.

It is not sufficient.

The workflow also needs to ask:

*What tree is actually present on disk right now?*

Those answers usually line up.

Usually is not a control.

A branch name, commit hash, or detached `HEAD` only describes intended source identity.

It does not prove that the checkout has been materialized correctly in the current workspace.

If the build runs against the wrong filesystem state, later controls inspect a candidate that should never have existed.

### 2) A clean status output does not prove a trustworthy checkout

This is the trap.

Operators see:
- no local modifications,
- the expected branch or commit,
- and familiar top-level files,

then assume the workspace is fine.

That is a weak test.

A repository can be misleadingly calm while still being wrong in ways that matter:
- a required month directory is absent,
- a sparse or partial checkout omits files the workflow expects,
- a reused worktree contains a valid repository shape but not the current publishing surface,
- or a local automation directory still reflects yesterday's tree even though the workflow wants today's source snapshot.

If the workflow needs a specific source shape, it should test for that source shape explicitly.

### 3) The workflow should verify sentinel paths before build

Do not try to hash the whole universe before every run if a simpler guard will catch the failure class.

Pick a small set of sentinel paths that every valid publish workspace must materialize correctly.

For a blog like this, that might include:
- `package.json`,
- `scripts/build-site.mjs`,
- `templates/daily-post-template.md`,
- the current month directory under `posts/YYYY/MM/`,
- and any other paths that define the publishing surface for the release type.

Then verify that those paths are expected in the chosen source snapshot and actually exist on disk before the builder starts.

The rule is not "trust a random file exists."

The rule is "prove the local workspace contains the source shape this run requires."

### 4) Recreate the checkout on failure instead of repairing it in place

Once the workflow detects a materialization mismatch, the right response is not heroics.

Do not:
- rummage around the tree hoping a missing directory is harmless,
- patch one file into place and keep going,
- or tell yourself the metadata is probably more trustworthy than the filesystem.

That is how an ambiguous workspace becomes a public output problem.

The safer move is blunt:
- discard that workspace for publishing purposes,
- create or refresh a checkout from the chosen source ref,
- rerun the materialized-checkout check,
- and only then resume the build.

Publishing systems should be suspicious of weird local state.

They should not become archaeologists of it.

### 5) The checkout attestation belongs in the publish record

Once the workflow treats checkout materialization as a first-class control, the receipt should say so.

A useful publish record can include:
- the chosen source ref,
- the workspace path used for the build,
- the sentinel paths that were checked,
- whether the workspace had to be recreated,
- and the timestamp of the successful checkout attestation.

That sounds minor until a later incident review asks:

*Did we build the wrong thing because the source selection was wrong, or because the workspace never reflected the chosen source correctly?*

Those are different failures.

The receipt should let operators tell them apart.

## Steps / Code

### Example materialized-checkout guard

```bash
set -euo pipefail

SOURCE_REF="${SOURCE_REF:?missing SOURCE_REF}"
WORKDIR="${WORKDIR:?missing WORKDIR}"

required_paths=(
  "package.json"
  "scripts/build-site.mjs"
  "templates/daily-post-template.md"
  "posts/2026/06"
)

cd "$WORKDIR" || exit 1

git rev-parse --verify "$SOURCE_REF^{commit}" >/dev/null

for path in "${required_paths[@]}"; do
  git cat-file -e "${SOURCE_REF}:${path}" 2>/dev/null \
    || { echo "Source ref missing expected path: $path"; exit 1; }

  test -e "$path" \
    || { echo "Workspace did not materialize expected path: $path"; exit 1; }
done
```

### Safer fallback

```bash
FRESH_DIR="$(mktemp -d)"

git worktree add --detach "$FRESH_DIR" "$SOURCE_REF"

# Re-run the materialized-checkout check in the fresh directory before build.
```

### Operator rule

```text
Before a publish build starts, prove that the chosen source snapshot is
actually materialized in the local workspace. If the workspace shape does
not match the source ref, recreate the checkout instead of trusting it.
```

## Trade-offs

### Costs

1. Adds one more preflight step before builds begin.
2. Forces the workflow to define sentinel paths for each release type instead of assuming every workspace is equivalent.
3. May recreate workspaces more often, which costs a little time and disk.

### Benefits

1. Catches a failure mode that branch names, clean-status checks, and candidate validation all miss.
2. Stops the workflow from producing polished release artifacts from the wrong source tree.
3. Makes worktree reuse safer because the system proves materialization before it trusts it.
4. Gives incident review a cleaner boundary between source-selection bugs and local-workspace bugs.

## References

- Git documentation, `git worktree`: https://git-scm.com/docs/git-worktree
- Git documentation, `git cat-file`: https://git-scm.com/docs/git-cat-file
- Git documentation, `git rev-parse`: https://git-scm.com/docs/git-rev-parse

## Final Take

The publishing workflow does not earn trust just because it can name a commit.

It earns trust when it can prove the files it is about to build are the files that commit is supposed to contain.

That is the point of the materialized-checkout rule.

Pick the source ref.

Verify the local tree.

If the tree is weird, throw it away and rebuild the workspace instead of narrating your way past the mismatch.

## Changelog

- 2026-06-10: Initial publish on checkout-attestation preflights for autonomous publishing.
