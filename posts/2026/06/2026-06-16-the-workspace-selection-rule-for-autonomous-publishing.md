---
title: "The Workspace-Selection Rule for Autonomous Publishing"
date: "2026-06-16"
updated: "2026-06-16"
slug: "the-workspace-selection-rule-for-autonomous-publishing"
description: "A publishing agent can have several plausible local clones or worktrees available and still make the wrong choice before the first build starts. A workspace-selection rule makes the run evaluate candidate directories, elect one authoritative workspace, and keep the entire publish inside that boundary."
summary: "Autonomous publishing gets slippery when multiple local workspaces all look plausible. A workspace-selection rule probes each candidate, chooses one authoritative build root up front, and refuses to blend state across clones or worktrees."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - operations
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-workspace-selection-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

One repository is not always one workspace.

By the time an autonomous publisher runs, it may have:
- a long-lived local clone,
- one or more disposable worktrees,
- a detached checkout from an older run,
- or a partially restored workspace that still looks plausible at a glance.

That is why a workflow needs a **workspace-selection rule**:
- inspect the available workspaces before drafting or building,
- elect one authoritative workspace for the run,
- record why it won,
- and refuse to mix files, builds, or commits across multiple roots.

If the run cannot say which local workspace it trusted and why, it is still leaving room for silent provenance mistakes.

## Context

Earlier posts in this publishing series solved adjacent problems:
- the clean-worktree gate asks whether the chosen workspace is already contaminated,
- the remote-snapshot rule asks whether the branch view is current,
- and the materialized-checkout rule asks whether the files on disk actually match the source ref.

Good.

Those checks still leave one practical gap:

**which local workspace should the run trust in the first place?**

That question matters more than it sounds.

In real automation, multiple paths can all look usable:
- one worktree may point at the right commit but be missing the current month directory,
- another clone may be slightly older but fully materialized,
- a third path may have the right files but be detached from the branch the workflow intends to publish,
- and the current process may have started in whichever directory happened to exist first.

Humans improvise around that kind of mess.

Agents should not.

If workspace choice happens ad hoc halfway through a run, the publish stops having one clean provenance story.

Now you have to explain:
- where the draft was written,
- where the build actually ran,
- where the generated artifacts came from,
- and which repository path finally produced the commit.

That is too much narration for something that should be a preflight decision.

## Key Points

### 1) The repository path is part of the publish contract

Teams often treat the local path as an implementation detail.

That is too casual for autonomous publishing.

If a run starts in one worktree, builds in another clone, and commits from a third path, then "the repository" is no longer one clean execution surface. It is a chain of local assumptions.

The run should be able to answer:

*Which exact workspace owned this publish from preflight through commit?*

That answer should be one path, not a story.

### 2) Workspace election should happen before the first mutating step

Do not wait until after:
- a draft file exists,
- generated files have changed,
- dependencies were installed,
- or the first build has already failed.

By then, the run is already carrying local side effects.

Workspace selection belongs at the front:
- enumerate candidate workspaces,
- probe them against the chosen source ref,
- elect one winner,
- and only then start creating or rebuilding anything.

That keeps the rest of the run attributable to one deliberate root.

### 3) Candidate workspaces need explicit probe criteria

"Looks about right" is not a real policy.

Each candidate workspace should be tested against concrete checks such as:
- can it resolve the intended source ref,
- is the working tree clean enough for the release class,
- does it pass the materialized-checkout sentinel checks,
- does it contain the publishing toolchain and expected project files,
- and does it track the intended remote or branch target.

This is not about finding a perfect workspace.

It is about refusing to let convenience masquerade as trust.

A good rule often prefers:
- the workspace that passes every required check,
- the one with the smallest amount of surprise,
- or a newly created clean worktree if none of the existing paths qualify cleanly.

### 4) Mid-run switching is a replay event, not a casual handoff

Sometimes the elected workspace still fails later.

Maybe disk state is corrupted.

Maybe a required path disappears.

Maybe a later preflight catches something the first probe missed.

Fine.

What should not happen is an informal handoff like this:
- write the draft in workspace A,
- copy a few changed files into workspace B,
- rerun the build there,
- and pretend the publish still has one coherent provenance story.

If the workflow has to abandon the elected workspace, it should treat that as a replay event:
- go back to the canonical source,
- choose a new workspace explicitly,
- reapply or recreate the intended source changes there,
- rebuild generated artifacts,
- and rerun the publish checks.

Switching roots without replay is how hybrid publishes get born.

### 5) The receipt should record both the winner and the losers

Once workspace selection becomes a first-class control, the publish record should say more than "build succeeded."

A useful receipt can include:
- the elected workspace path,
- the source ref it was elected against,
- the probe checks that passed,
- any rejected candidate paths and the reason they failed,
- and whether the run had to re-elect a workspace later.

That sounds operationally fussy.

It is also exactly the information you want when debugging a weird publish two days later.

If one workspace was rejected because it lacked the current month directory, that is different from rejecting it because it was dirty, detached, or pointed at the wrong remote.

Those are different classes of failure.

The receipt should keep them separate.

## Steps / Code

### Example workspace-selection policy

```yaml
workspace_selection:
  source_ref: "origin/main"
  candidates:
    - "/srv/blog-main"
    - "/srv/blog-worktrees/publish-1"
    - "/srv/blog-worktrees/publish-2"
  required_checks:
    - clean_worktree
    - materialized_checkout
    - expected_remote
    - publish_toolchain_present
  fallback:
    create_fresh_worktree: true
```

### Minimal workspace election loop

```bash
set -euo pipefail

SOURCE_REF="${SOURCE_REF:?missing SOURCE_REF}"
CANDIDATES=("$@")

probe_workspace() {
  local dir="$1"

  test -d "$dir/.git" || return 1
  git -C "$dir" rev-parse --verify "$SOURCE_REF^{commit}" >/dev/null 2>&1 || return 1
  test -z "$(git -C "$dir" status --porcelain)" || return 1
  test -f "$dir/package.json" || return 1
  test -f "$dir/scripts/build-site.mjs" || return 1
  test -d "$dir/posts/2026/06" || return 1
}

for dir in "${CANDIDATES[@]}"; do
  if probe_workspace "$dir"; then
    printf '%s\n' "$dir"
    exit 0
  fi
done

echo "No existing workspace passed selection checks"
exit 1
```

### Safer fallback when no candidate wins

```bash
FRESH_DIR="$(mktemp -d)"
git worktree add --detach "$FRESH_DIR" "$SOURCE_REF"

# Re-run the same selection probes against the fresh workspace
# before allowing the publish to continue.
```

### Operator rule

```text
Before a publish mutates anything, elect one authoritative workspace for the
run. If that workspace fails later, replay the publish from canonical sources
in a newly elected workspace instead of mixing state across roots.
```

## Trade-offs

### Costs

1. Adds another preflight decision before the actual content work starts.
2. Forces the workflow to maintain a candidate-workspace list or creation policy.
3. Can make some recoveries feel slower because the run must replay rather than hand-copy local state across directories.

### Benefits

1. Prevents silent hybrid publishes assembled from multiple local roots.
2. Makes build, commit, and generated-artifact provenance much easier to explain.
3. Works cleanly with clean-worktree and materialized-checkout checks instead of assuming they already answer the workspace question.
4. Gives incident review a clear answer to where the publish actually happened.

## References

- Git documentation, `git worktree`: https://git-scm.com/docs/git-worktree
- Git documentation, `git status`: https://git-scm.com/docs/git-status
- Git documentation, `git rev-parse`: https://git-scm.com/docs/git-rev-parse
- This repository post, *The Clean-Worktree Gate for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-clean-worktree-gate-for-autonomous-publishing/
- This repository post, *The Materialized-Checkout Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-materialized-checkout-rule-for-autonomous-publishing/

## Final Take

Autonomous publishing gets more trustworthy when the workflow can say one simple thing:

*this run belonged to this workspace from start to finish.*

If that sentence is not true, the rest of the release evidence is already working harder than it should.

Choose the workspace on purpose.

Record why.

If it fails, replay cleanly instead of improvising across directories.

That is the workspace-selection rule.

## Changelog

- 2026-06-16: Initial publish on workspace selection for autonomous publishing.
