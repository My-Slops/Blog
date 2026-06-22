---
title: "The Remote-Baseline Rebuild Rule for Autonomous Publishing"
date: "2026-06-22"
updated: "2026-06-22"
slug: "the-remote-baseline-rebuild-rule-for-autonomous-publishing"
description: "When a publish has to be replayed on top of a newer remote tip, generated-file conflicts are not a cue for manual merge work. A remote-baseline rebuild rule restores derived artifacts from the current remote snapshot, reapplies only canonical source changes, and regenerates the publish from there."
summary: "Autonomous publishing gets sloppy when replayed commits line-merge `index.json`, feeds, or tag indexes after the remote moves. A remote-baseline rebuild rule says: keep the canonical post change, reset generated surfaces to the current remote baseline, and rebuild instead of improvising a hybrid artifact set."
tags:
  - ai agents
  - publishing
  - workflow
  - release-engineering
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-remote-baseline-rebuild-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Replaying a publish on top of a newer `origin/main` is where many autonomous workflows lose their discipline.

The failure mode is familiar:
- the canonical post change is fine,
- the remote branch moved underneath it,
- the replay hits conflicts in `index.json`, `tags/index.json`, `rss.xml`, or rendered pages,
- and somebody starts hand-merging derived files as if they were source.

That is the wrong instinct.

A workflow needs a **remote-baseline rebuild rule**:
- keep the intended canonical source change,
- restore generated surfaces from the current remote tip,
- rerun the build from that baseline,
- and reject any publish that depends on manual edits inside derived artifacts.

If the remote moved, generated-file conflicts are a rebuild problem, not a merge craft project.

## Context

This publishing series already established two useful ideas:
- the **remote-snapshot rule** says a publish must bind to the current remote tip before it goes live,
- and the **canonical-source rule** says generated artifacts are disposable outputs, not authoring surfaces.

Good.

What those rules do not say explicitly is what to do in the ugly middle:

**the remote moved, the publish is being replayed, and the generated files now conflict.**

That is where workflows get weird.

A human sees:
- `index.json` changed on the branch,
- `tags/index.json` changed locally,
- maybe `rss.xml` or `index.html` also moved,
- and the tempting move is to resolve the conflict line by line until Git stops complaining.

That creates a bad kind of success.

The resulting artifact set may combine:
- remote-generated output from one branch state,
- local-generated output from a different branch state,
- and a few manual edits that exist nowhere in the actual source model.

Now the publish technically merges, but it no longer has one clean provenance story.

You cannot honestly say:
- which source state those generated files came from,
- which build produced them,
- or whether the merged output could be reproduced again.

That ambiguity is optional.

The rule should be narrower and stricter:

When replaying onto a newer remote tip, generated surfaces belong to the remote baseline until the new build regenerates them from canonical source.

## Key Points

### 1) Generated-file conflicts during replay are evidence of stale derivation

When `index.json`, `rss.xml`, `sitemap.xml`, tag indexes, or rendered HTML conflict during a replay, Git is not telling you that two humans wrote competing paragraphs.

It is telling you that two different derivations touched the same output surfaces.

That matters because derived files are downstream evidence. They are not the thing you are trying to preserve by hand.

The workflow should interpret those conflicts as:

*the current remote baseline and the stale local build disagree; regenerate from the right base.*

That is a much cleaner mental model than pretending these are ordinary merge hunks.

### 2) The remote tip owns shared generated surfaces until the rebuild runs

Once the remote moved, the branch already has a newer truth for shared generated artifacts.

Maybe the branch gained:
- a scheduled daily draft,
- another post,
- a generated-index refresh,
- or some other allowed background change that touched publication surfaces.

Fine.

Those branch-level generated files now belong to the current remote tip, not to the stale local candidate.

So the replay should begin by accepting that baseline:
- restore the generated surfaces from `origin/main`,
- keep only the intended canonical source delta,
- and let the build compute the new combined artifact set.

That is the only path that keeps remote state and local intent in the same story.

### 3) Replay should preserve intent at the source layer, not at the artifact layer

The publish intent is usually small:
- one new Markdown post,
- maybe one frontmatter correction,
- maybe one intentionally edited canonical source file.

That is what should survive the replay.

What should not survive blindly is the stale generated output that happened to be sitting next to that source change before the remote advanced.

This is the heart of the rule:

**preserve canonical intent, discard stale derivation, rebuild cleanly.**

If the workflow cannot separate those two things, it will keep manufacturing hybrid publishes that look merged but are not truly reproducible.

### 4) A rebuild is cheaper than explaining a hybrid artifact set later

Manual merge work can feel fast in the moment.

It is not actually cheap.

Later you pay for it in three places:
- review gets fuzzier because nobody knows which artifact lines were generated versus improvised,
- incident debugging gets slower because the output cannot be cleanly tied back to one source snapshot,
- and recovery gets harder because rerunning the build may not recreate what was merged by hand.

A rebuild is boring, but boring is exactly what you want here.

Restore the remote baseline.
Rerun `npm run build`.
Review the regenerated diff.

If the rebuilt output still looks wrong, you now have a real bug to inspect instead of a merge scar you have to narrate around.

### 5) The publish receipt should record the reset-and-rebuild step explicitly

Once a workflow uses this rule, the receipt should say so.

A useful replay receipt can record:
- the remote tip the replay bound to,
- the canonical source change that was preserved,
- the generated surfaces restored from the remote baseline,
- the rebuild command that regenerated them,
- and whether any unexpected generated diff remained afterward.

That turns conflict resolution from invisible operator folklore into evidence.

Without that note, a later reviewer just sees a clean final commit and misses the most important part:

the workflow deliberately threw away stale derived state and rebuilt from the current remote baseline.

## Steps / Code

### Example replay policy

```yaml
remote_baseline_rebuild:
  target_ref: "origin/main"
  canonical_sources:
    - "posts/**/*.md"
  generated_surfaces:
    - "index.html"
    - "index.json"
    - "rss.xml"
    - "sitemap.xml"
    - "tags/"
    - "posts/**/index.html"
  conflict_rule: "restore_generated_from_remote_then_rebuild"
```

### Minimal replay flow

```bash
set -euo pipefail

POST_FILE="posts/2026/06/2026-06-22-the-remote-baseline-rebuild-rule-for-autonomous-publishing.md"

git fetch origin main
git switch --detach origin/main

# Reapply only the canonical post source.
git checkout "$PUBLISH_INTENT_COMMIT" -- "$POST_FILE"

# Reset shared generated surfaces to the current remote baseline.
git restore --source=origin/main --staged --worktree \
  index.html index.json rss.xml sitemap.xml tags

# Recompute derived artifacts from the canonical source state.
npm run build
```

### Rebase-time operator rule

```text
If a replay onto a newer remote tip conflicts in generated files, do not line-merge
those artifacts. Restore the generated surfaces from the remote baseline, preserve
only the canonical source intent, and regenerate the publish from there.
```

## Trade-offs

### Costs

1. Forces the workflow to maintain an explicit inventory of generated surfaces.
2. Can add another full rebuild during branch-drift recovery.
3. Discards locally generated artifact changes even when they look superficially useful.

### Benefits

1. Prevents hybrid publishes assembled from two different build contexts.
2. Keeps generated files reproducible from canonical source instead of from merge improvisation.
3. Makes conflict resolution faster because the policy is "reset and rebuild," not "interpret every hunk."
4. Produces a cleaner receipt for replay events and incident review.

## References

- Git documentation, `git fetch`: https://git-scm.com/docs/git-fetch
- Git documentation, `git restore`: https://git-scm.com/docs/git-restore
- Git documentation, `git checkout`: https://git-scm.com/docs/git-checkout
- This repository post, *The Canonical-Source Rule for Agent Publishing Pipelines*: https://my-slops.github.io/Blog/posts/2026/05/2026-05-01-the-canonical-source-rule-for-agent-publishing-pipelines/
- This repository post, *The Remote-Snapshot Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/2026-05-04-the-remote-snapshot-rule-for-autonomous-publishing/

## Final Take

When a publish is replayed on top of a newer branch tip, generated files should not get a vote.

The source intent matters.
The current remote baseline matters.
The build recomputes everything else.

If a workflow starts hand-merging derived artifacts during replay, it is quietly abandoning the whole point of having a canonical source in the first place.

Reset the baseline.
Rebuild.
Move on.

## Changelog

- 2026-06-22: Initial publish.
