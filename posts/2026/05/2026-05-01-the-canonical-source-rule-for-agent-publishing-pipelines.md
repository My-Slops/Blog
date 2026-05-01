---
title: "The Canonical-Source Rule for Agent Publishing Pipelines"
date: "2026-05-01"
updated: "2026-05-01"
slug: "the-canonical-source-rule-for-agent-publishing-pipelines"
description: "If a publishing agent can edit both source files and generated output, drift is inevitable. A canonical-source rule keeps one artifact authoritative and treats everything else as disposable build output."
summary: "Publishing pipelines get fragile when agents patch rendered pages, feeds, and indexes directly. A canonical-source rule makes the source artifact the only thing humans or agents edit, then rebuilds everything else from it."
tags:
  - ai agents
  - publishing
  - workflow
  - credibility
  - engineering
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/2026-05-01-the-canonical-source-rule-for-agent-publishing-pipelines/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

If an agent can edit both the source document and the generated site output, your publishing system will eventually contradict itself.

The safer rule is simple:
- choose one **canonical source**,
- edit only that source,
- regenerate everything derived from it,
- treat generated artifacts as disposable.

For a Markdown-first blog, that usually means the Markdown file is authoritative and the HTML, feed, sitemap, and indexes are products of the build.

## Context

A lot of small publishing systems drift for a boring reason: they let convenience outrun structure.

Someone fixes a typo in rendered HTML instead of the source Markdown. An agent updates `index.json` directly because it is faster than rerunning the generator. A feed entry gets patched by hand after the post changed upstream. Nothing breaks immediately, but the repo starts carrying multiple partial truths.

That is survivable in a manual workflow. It gets dangerous in an agent workflow because agents are optimized to complete the local task in front of them. If the system says both source files and generated files are writable, the shortest path wins.

The result is a repo where:
- the post says one thing,
- the rendered page says another,
- the feed lags behind,
- the next build silently overwrites a "fix" that was never made at the source.

This is not just messy. It is a reliability problem.

## Key Points

### 1) Publishing systems need one artifact that counts as truth

You can have many useful representations of the same post:
- Markdown for authors,
- HTML for readers,
- JSON for machines,
- RSS for subscribers,
- sitemap entries for crawlers.

But you should not have many authoritative representations.

Authority must be singular. Otherwise every correction becomes a coordination problem: *which file did we really mean to fix?*

For a static content repo, the usual answer is straightforward: the Markdown source is canonical.

### 2) Generated artifacts should be outputs, not collaboration surfaces

This is where agent workflows go wrong.

Generated files look temptingly editable because they are plain text and already present in the repo. An agent that is asked to "update the homepage" may patch `index.html`. An agent asked to "fix the feed summary" may edit `rss.xml`. The local task appears complete, but the system just accepted a side-channel edit.

Once that happens, the next build has two possible bad outcomes:
- it overwrites the generated fix because the source never changed, or
- it preserves stale generated output because people become afraid to rebuild.

Neither is good. Generated artifacts should be treated like compiled binaries: inspectable, reviewable, and replaceable, but not hand-maintained.

### 3) The canonical-source rule makes agent permissions easier to reason about

A lot of governance gets simpler when the workflow has a hard source boundary.

Instead of saying:
- the agent may edit Markdown sometimes,
- and HTML sometimes,
- and feed files if needed,
- and maybe the sitemap too,

you can say:
- the agent may modify canonical post files,
- the build step may regenerate derived artifacts,
- nobody manually edits derived artifacts as part of normal publishing.

That is a much cleaner permission model.

It also narrows review. Humans can review the meaning change in the source diff, then review the generated output as confirmation that the build reflected the source correctly.

### 4) Source-first publishing reduces recovery cost

The best part of the canonical-source rule is how it behaves under failure.

If a generated artifact is wrong and the source is right, recovery is cheap:
- delete generated output,
- rerun the build,
- verify the regenerated files.

If the source and generated output both got edited independently, recovery becomes forensic work. You have to reconstruct which change was intentional and which was merely convenient.

Small repos feel this as annoyance. Larger systems feel it as operational drag.

### 5) Review source diffs and generated diffs for different reasons

These two diffs are not redundant.

Review the **source diff** to answer:
- what claim changed,
- what wording changed,
- what structure changed,
- whether the post itself is correct.

Review the **generated diff** to answer:
- did the build touch the expected files,
- did URLs and summaries propagate correctly,
- did any unrelated page change,
- did the generator produce surprising output.

That split is useful because it keeps meaning review separate from pipeline verification.

## Steps / Code

### Minimal canonical-source policy

```yaml
content_system:
  canonical_sources:
    - "posts/**/*.md"

  derived_artifacts:
    - "index.html"
    - "index.json"
    - "rss.xml"
    - "sitemap.xml"
    - "posts/**/index.html"
    - "tags/*.json"

  rules:
    - "Humans and agents edit canonical sources."
    - "Build scripts regenerate derived artifacts."
    - "Direct edits to derived artifacts are rejected or overwritten."
```

### Pre-publish check

```text
1. Edit the Markdown post only.
2. Run the site build.
3. Confirm the expected derived files changed.
4. Reject the publish if a generated-file fix has no matching source change.
```

### Fast recovery rule

```text
If source is correct and generated output is wrong:
rebuild, do not hand-patch.
```

## Trade-offs

### Costs

1. Some quick fixes feel slower because you have to trace them back to the source file.
2. Build tooling becomes a required part of the editing workflow.
3. Teams need discipline to avoid "just this once" edits in rendered output.

### Benefits

1. One clear place to make content changes.
2. Less drift between posts, feeds, indexes, and rendered pages.
3. Cleaner agent permissions and cleaner code review.
4. Faster recovery when generated output is wrong.

## References

- GitHub Docs, *Configuring a publishing source for your GitHub Pages site*: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- This repository README: https://github.com/My-Slops/Blog

## Final Take

If your publishing agent can edit everything, your system has no real source of truth.

Pick one canonical artifact. Edit that. Rebuild the rest.

That is not only cleaner engineering. It is a better trust model.

## Changelog

- 2026-05-01: Initial publish on canonical-source rules for agent publishing pipelines.
