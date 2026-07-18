---
title: "Repository Context Is a Dependency, Not a Prompt Attachment"
date: "2026-07-18"
updated: "2026-07-18"
created_at: "2026-07-18T10:00:00-04:00"
published_at: "2026-07-18T10:00:00-04:00"
scheduled_at: "2026-07-18T10:00:00-04:00"
slug: "repository-context-is-a-dependency-not-a-prompt-attachment"
description: "An agent cannot make a safe change from an arbitrary collection of files; the selected context is a dependency that must be scoped and refreshed."
summary: "Give coding agents a deliberate repository slice: the relevant code, tests, policy files, and current Git state. More files are not automatically more context."
tags: [AI agents, developer tooling, software engineering]
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/repository-context-is-a-dependency-not-a-prompt-attachment/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

“Give the agent the repository” sounds safe because it sounds complete. In practice it often means the agent receives stale generated files, unrelated local edits, duplicate instructions, and just enough information to make a plausible mistake.

Repository context is a dependency of a change. Like any dependency, it needs a declared version, a bounded surface, and a way to detect when it is no longer the thing the change was reviewed against.

## Start with the contract, not the tree

For a small bug fix, the useful context usually includes:

- the target implementation and its direct callers,
- the relevant tests and build command,
- repository instructions that apply to that path,
- the current branch/ref and working-tree status,
- generated-versus-canonical ownership rules.

That is more valuable than indiscriminately pasting every Markdown file, vendor lockfile, and build artifact into a prompt. Large, undifferentiated context does not make an agent careful. It makes conflicting signals easier to miss.

Git already offers a useful analogy. Sparse checkout lets a worker materialize only selected paths; submodules and worktrees make repository identity explicit. Agent tooling need not use those exact mechanisms, but it should preserve their lesson: scope is part of the environment, not a presentation preference.

## Refresh after state changes

An agent that inspected `main` before another worker pushed has a stale baseline. An agent that read source before generation may be looking at a different truth than one that edits emitted files. The recovery is not “remember harder”; it is to re-read the narrow facts that affect the next mutation:

```text
before edit:   current ref, status, target file ownership
before commit: staged diff, current parent
before push:   remote ref, expected ancestry
```

This is not an argument for turning every edit into a ceremony. It is an argument for placing fresh evidence at the boundaries where stale context causes irreversible mistakes.

## References

- [Git sparse-checkout documentation](https://git-scm.com/docs/git-sparse-checkout) describes intentionally restricting the working tree to relevant paths.
- [Git worktree documentation](https://git-scm.com/docs/git-worktree) describes separate working trees tied to explicit repository state.

## Final take

Context is not a blob handed to an agent. It is a dependency graph that should be scoped before a change and refreshed before a consequential action.

## Changelog

- 2026-10-03T00:08:49-04:00: Recovered the 2026-07-18 slot; this expands agent practice without duplicating the archive’s publishing-state topics.
