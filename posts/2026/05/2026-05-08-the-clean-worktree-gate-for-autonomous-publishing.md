---
title: "The Clean-Worktree Gate for Autonomous Publishing"
date: "2026-05-08"
updated: "2026-05-08"
slug: "the-clean-worktree-gate-for-autonomous-publishing"
description: "Autonomous publishers should not start from a messy repository state. A clean-worktree gate keeps leftover edits, stale generated files, and unrelated drafts from leaking into a real publish."
summary: "Autonomous publishers should refuse to start from a dirty working tree. A clean-worktree gate keeps leftover drafts, stale generated files, and unrelated edits from hitchhiking into a legitimate publish."
tags:
  - ai agents
  - publishing
  - verification
  - workflow
  - safety
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/2026-05-08-the-clean-worktree-gate-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

An autonomous publisher should not begin real work in a dirty repository.

If the working tree already contains modified, staged, or untracked files, the agent should stop before drafting, building, or committing anything public.

That is the **clean-worktree gate**:
- start from a known-clean state,
- make the publish changes intentionally,
- review only the changes created by this run.

The point is not tidiness. The point is provenance.

## Context

Publishing repositories are deceptively easy to contaminate.

One legitimate post can touch:
- one canonical Markdown file,
- one rendered page,
- the homepage,
- feeds,
- sitemaps,
- tag indexes.

Now add one messy local state:
- an old draft,
- a half-finished generated file,
- a manual edit someone forgot to commit,
- a temporary script output sitting untracked in the repo.

Humans sometimes notice that mess and work around it. Agents often do something worse: they continue from the inherited state as if it were normal.

That is how unrelated edits hitchhike into a publish. The content may be fine. The repository state is not.

## Key Points

### 1) A dirty working tree means the run does not own its diff

The publish run should be able to answer a basic question:

*Which changes in this commit were created by this run?*

If the repository was already dirty at start, that answer is blurry immediately.

Maybe the extra change is harmless. Maybe it is a stale draft. Maybe it is a manual fix the agent is about to overwrite. The problem is not that every dirty file is dangerous. The problem is that the run no longer has clean provenance.

Autonomous publishing needs stronger standards than "it probably belongs there."

### 2) Untracked files are part of the risk, not an exception to it

Teams sometimes check only tracked modifications and ignore untracked files.

That is sloppy.

Untracked files can still become publish risk:
- a generated page created by a previous failed run,
- a copied post file with the wrong date,
- a scratch manifest that later gets added with `git add .`,
- a local asset that changes what the build includes.

If the rule is "clean enough," the workflow becomes guesswork.

The cleaner rule is simpler: no modified, staged, or untracked repository files unless they were created deliberately for this publish.

### 3) The clean-worktree gate belongs at the beginning, not just the end

The expected-diff rule is a good last-mile check.

It is not a substitute for a clean start.

Starting dirty creates two bad habits:
- the agent treats inherited state as implicit input,
- reviewers have to reconstruct which files came from before the run.

The clean-worktree gate removes that ambiguity before the draft even exists.

Then the expected-diff rule can do its own job later:
- confirm that the run changed only what it intended to change.

These checks are complementary:
- **clean-worktree gate** answers "did this run start from a trustworthy baseline?"
- **expected-diff rule** answers "did this run end with the right change set?"

You want both.

### 4) Isolation is better than cleanup theater

When a repository is dirty, the answer should not be "tell the agent to be careful."

The better options are operational:
- stop and ask for cleanup,
- create a fresh worktree,
- rebuild the publish from a clean branch tip,
- limit the run to a dedicated publishing workspace.

This is one of those cases where infrastructure beats discipline.

An agent with a clean disposable workspace is easier to trust than an agent expected to tiptoe around somebody else's leftovers.

### 5) Escape hatches should be explicit and narrow

Sometimes a dirty start is intentional.

Maybe a human has already prepared a canonical draft and wants the agent only to render and publish it. Fine. But that should be explicit:
- the intended files are named,
- the scope is confirmed,
- the rest of the tree is still clean.

What should not happen is a silent fallback from "strict automation" to "whatever happens to be in the repo right now."

If you need an exception, make it a declared exception.

## Steps / Code

### Minimal preflight

```bash
if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean; stop publish"
  git status --short
  exit 1
fi
```

### Slightly stricter operator message

```text
Publish blocked.

Reason:
- Repository is not clean before publish start.

Required next step:
- Commit, discard, or move unrelated changes out of this workspace.

Only restart once the working tree reflects the exact intended baseline.
```

### Better workflow shape

```text
1. Fetch the current branch tip.
2. Prepare a clean workspace or worktree.
3. Create the canonical post.
4. Build generated artifacts.
5. Verify the expected diff.
6. Commit and publish.
```

## Trade-offs

### Costs

1. Adds friction before runs that might have "worked anyway."
2. Forces teams to get more disciplined about local scratch work.
3. May require separate worktrees or dedicated automation directories.

### Benefits

1. Prevents unrelated edits from leaking into public publishes.
2. Makes every publish diff attributable to one run.
3. Simplifies review because the starting state is no longer ambiguous.
4. Reduces accidental overwrites of human work already sitting in the repo.

## References

- Git documentation, `git status`: https://git-scm.com/docs/git-status
- Git documentation, `git worktree`: https://git-scm.com/docs/git-worktree
- GitHub Docs, *What is GitHub Pages?*: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages

## Final Take

If a publish starts from a messy tree, you are already negotiating with ambiguity.

Do not let the agent improvise around that.

Stop early. Get clean. Then publish.

## Changelog

- 2026-05-08: Initial publish on clean-worktree preflights for autonomous publishing.
