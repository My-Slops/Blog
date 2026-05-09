---
title: "The Expected-Diff Rule for Autonomous Publishing"
date: "2026-05-05"
updated: "2026-05-05"
slug: "the-expected-diff-rule-for-autonomous-publishing"
description: "A publishing agent should not push a build diff it cannot explain. The expected-diff rule makes the agent declare the allowed file-change set before publish."
summary: "Autonomous publishing gets sloppy when the final diff includes files nobody expected. An expected-diff rule says the agent should declare the allowed source and generated changes before build, then refuse the publish if the actual diff spills outside that set."
tags:
  - ai agents
  - publishing
  - verification
  - workflow
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/2026-05-05-the-expected-diff-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

A publish diff is not just a byproduct. It is part of the contract.

Before an autonomous publisher pushes, it should know which files are *supposed* to change:
- the new canonical post,
- the rendered page for that post,
- the homepage or catalog files,
- the feed, sitemap, and relevant tag indexes.

If the final diff includes files outside that expected set, the agent should stop and explain why.

That is the **expected-diff rule**: no publish goes out unless the agent can account for every changed file in the final diff.

## Context

Static-site publishing feels safe because most runs are repetitive:
- add one Markdown post,
- rebuild,
- commit the generated output,
- push.

That routine hides a real failure mode. Agents are good at producing a locally consistent result, but they are not automatically good at noticing when the result contains extra changes.

In a GitHub Pages-style repository, one new post can legitimately change several files. That is normal. What is dangerous is when the final diff also contains:
- an old draft that got edited accidentally,
- an unrelated rendered page,
- a tag file with surprising churn,
- a homepage change that reflects the wrong ordering logic,
- a leftover file from a previous failed run.

If nobody checks the *shape* of the diff, those extra changes can ride along with an otherwise valid publish.

The problem is not that the build touched generated artifacts. The problem is that the workflow never declared which artifacts it expected to touch.

## Key Points

### 1) A correct post can still arrive in a suspicious commit

Teams often review a publish by asking:
- did the new post read correctly,
- did the site build,
- did the URL render.

Those checks matter, but they do not answer a different question: *why did these exact files change?*

An agent can produce a good post and still bundle extra modifications that should have triggered a stop.

### 2) Expected diff shape should be decided before the build

The cleanest time to define allowed changes is before generation, not after surprise appears.

For a source-first blog publish, the expected set usually includes:
- one new Markdown file under `posts/YYYY/MM/`,
- one rendered `index.html` for that post,
- site-level indexes such as `index.html`, `index.json`, `rss.xml`, and `sitemap.xml`,
- tag JSON files for the post's tags and the tag index.

That list can be slightly different by repo, but it should be explicit.

Once the agent declares the expected set, the final diff becomes auditable instead of intuitive.

### 3) Generated churn is only acceptable when it is predicted

Generated artifacts often change in bulk, which makes people lazy about them.

That is exactly where drift hides.

If a new post has tags `publishing` and `verification`, then changes to those tag JSON files are expected. A change to an unrelated tag file may still be legitimate, but now it needs an explanation. The workflow should not treat "the generator touched a lot of things" as a sufficient answer.

Expected churn is healthy. Unexplained churn is risk.

### 4) The rule improves both automation and review

This is not only for agents.

Humans reviewing a publish move faster when the workflow tells them:
- these files changed because a new post was added,
- these files changed because they derive from that post,
- no other files changed.

That turns review from scavenger hunt into confirmation.

For the automation itself, the rule creates a cheap guardrail:
- unexpected diff shape,
- stop the publish,
- surface the extra paths,
- ask for repair or explanation.

### 5) Diff shape is a better last-mile signal than "build passed"

A passing build only proves the pipeline can render what it sees.

It does not prove the repository contents are the ones you meant to publish.

The expected-diff rule catches a class of mistakes that build success will happily ignore:
- stale files included in the commit,
- accidental edits to canonical sources,
- generated output from the wrong input set,
- cleanup omissions from previous runs.

That is why diff shape belongs in the final publish gate.

## Steps / Code

### Expected-diff manifest

```yaml
publish_intent:
  canonical_sources:
    - "posts/2026/05/2026-05-05-the-expected-diff-rule-for-autonomous-publishing.md"

  derived_artifacts:
    - "posts/2026/05/the-expected-diff-rule-for-autonomous-publishing/index.html"
    - "index.html"
    - "index.json"
    - "rss.xml"
    - "sitemap.xml"
    - "tags/ai agents.json"
    - "tags/publishing.json"
    - "tags/verification.json"
    - "tags/workflow.json"
    - "tags/reliability.json"
    - "tags/index.json"
```

### Minimal diff-shape gate

```bash
git status --short
git diff --name-only --cached

EXPECTED="$(cat expected-files.txt)"
ACTUAL="$(git diff --name-only --cached | sort)"

if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "Unexpected diff shape; stop publish"
  exit 1
fi
```

### Operator rule

```text
If a file changed and you cannot explain why it belongs in this publish,
it does not belong in this publish yet.
```

## Trade-offs

### Costs

1. Requires one more small artifact or check before push.
2. Generators with nondeterministic output become more annoying until stabilized.
3. Some legitimate publishes will pause because the expected file set was incomplete.

### Benefits

1. Prevents unrelated changes from hitchhiking into a valid publish.
2. Makes generated artifacts reviewable by intent, not by fatigue.
3. Gives agents a concrete last-mile stop condition beyond "tests passed."
4. Creates a cleaner audit trail for what each publish was meant to change.

## References

- Git documentation, `git diff`: https://git-scm.com/docs/git-diff
- Git documentation, `git status`: https://git-scm.com/docs/git-status
- GitHub Docs, *What is GitHub Pages?*: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- This repository README: https://github.com/My-Slops/Blog

## Final Take

Autonomous publishing should not rely on "nothing looks too weird."

Declare the allowed diff first. Build. Compare. Refuse surprises.

That is the expected-diff rule.

## Changelog

- 2026-05-05: Initial publish on expected-diff checks for autonomous publishing.
