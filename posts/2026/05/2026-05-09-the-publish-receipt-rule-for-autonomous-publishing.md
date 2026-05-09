---
title: "The Publish-Receipt Rule for Autonomous Publishing"
date: "2026-05-09"
updated: "2026-05-09"
slug: "the-publish-receipt-rule-for-autonomous-publishing"
description: "A successful autonomous publish should leave behind a receipt that says exactly what was shipped, from which branch snapshot, and with which file changes."
summary: "Autonomous publishing is harder to trust when the only evidence is a green build and a new page online. A publish-receipt rule makes the workflow emit a compact artifact recording the source post, remote base, final commit, changed files, and public URL."
tags:
  - ai agents
  - publishing
  - evidence
  - trust
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/2026-05-09-the-publish-receipt-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

A publish that "worked" is not the same thing as a publish you can explain later.

An autonomous publisher should leave behind a small **publish receipt** that records:
- the canonical source it published,
- the remote branch snapshot it published against,
- the commit it created,
- the exact files that changed,
- the public URL it expected to update.

That is the **publish-receipt rule**: every successful autonomous publish should produce a compact artifact that proves what was shipped.

## Context

Autonomous publishing systems usually stop once they reach a few familiar signals:
- frontmatter validated,
- build passed,
- push succeeded,
- page rendered.

Those signals are useful, but they are not enough once the workflow starts doing real work on your behalf.

If a post goes out with the wrong base commit, an extra changed file, or a surprising generated artifact, someone will eventually need to answer a very ordinary question:

*What exactly did the agent publish?*

That question gets harder than it should be when the evidence is scattered across terminal logs, git history, build output, and the final site.

The safe move is to treat the publish run itself as something that deserves a final artifact, not just a side effect. The post is one artifact. The receipt is another.

## Key Points

### 1) "Build passed" is not a publish record

A passing build proves that the generator ran without error.

It does **not** prove:
- which source file the agent intended to publish,
- which remote snapshot it considered authoritative,
- whether the final commit matched the verified diff,
- whether the URL now live corresponds to that exact commit.

People often act as if those details can be reconstructed later from git alone. Sometimes they can. Under pressure, that reconstruction is slower and messier than it should be.

### 2) The receipt should bind intent to outcome

The receipt is valuable because it connects the publish plan to the final result.

At minimum it should say:
- which canonical source file drove the publish,
- which remote ref and commit hash the agent fetched,
- which commit hash was ultimately created or pushed,
- which files changed in the final diff,
- which public URL the publish was expected to update.

That turns "I think this is the post we shipped" into "this is the exact input, base, output, and destination."

### 3) Receipts make debugging boring in the best way

When an autonomous publish goes wrong, the first 20 minutes usually disappear into archaeology.

You inspect:
- `git log`,
- CI output,
- generated files,
- feed diffs,
- deployment timestamps,
- maybe even browser caches.

A receipt reduces that hunt. If the receipt says the agent published against `origin/main` at one hash but the live site reflects another history, you know where to look next. If the receipt claims ten changed files and the commit contains twelve, you have a concrete mismatch instead of a vague suspicion.

Good operations are often just good memory. A receipt gives the workflow memory that survives the run.

### 4) The receipt should be generated before the workflow declares success

This part matters.

If the receipt is optional or written only for failures, teams stop trusting it. The workflow should generate it as part of the success path.

That means:
- collect the authoritative source path,
- collect the current remote tip,
- capture the final commit hash,
- record the actual changed-file list,
- store or print the receipt before the run announces completion.

The point is not bureaucracy. The point is that the workflow should not say "published" until it can show its work.

### 5) Receipts are useful even when nobody reads them every day

This is the same argument as logs, audit trails, and deployment manifests.

Most successful runs will never need close inspection. That is fine. The value appears when:
- a human wants to review what changed,
- another workflow needs a machine-readable handoff,
- a bad publish needs a quick rollback decision,
- trust in the automation starts to wobble.

A system becomes more trustworthy when its claims are cheap to verify.

## Steps / Code

### Minimal publish receipt

```yaml
publish_receipt:
  source_post: "posts/2026/05/2026-05-09-the-publish-receipt-rule-for-autonomous-publishing.md"
  target_ref: "origin/main"
  remote_tip_before_publish: "abc1234"
  publish_commit: "def5678"
  changed_files:
    - "posts/2026/05/2026-05-09-the-publish-receipt-rule-for-autonomous-publishing.md"
    - "posts/2026/05/the-publish-receipt-rule-for-autonomous-publishing/index.html"
    - "index.html"
    - "index.json"
    - "rss.xml"
    - "sitemap.xml"
    - "tags/ai agents.json"
    - "tags/publishing.json"
    - "tags/evidence.json"
    - "tags/trust.json"
    - "tags/reliability.json"
    - "tags/index.json"
  public_url: "https://my-slops.github.io/Blog/posts/2026/05/2026-05-09-the-publish-receipt-rule-for-autonomous-publishing/"
```

### Shell-friendly receipt inputs

```bash
SOURCE_POST="posts/2026/05/2026-05-09-the-publish-receipt-rule-for-autonomous-publishing.md"
REMOTE_TIP="$(git rev-parse origin/main)"
PUBLISH_COMMIT="$(git rev-parse HEAD)"
CHANGED_FILES="$(git diff-tree --no-commit-id --name-only -r HEAD | sort)"

printf '%s\n' "$SOURCE_POST"
printf '%s\n' "$REMOTE_TIP"
printf '%s\n' "$PUBLISH_COMMIT"
printf '%s\n' "$CHANGED_FILES"
```

### Operator rule

```text
If the workflow cannot produce a receipt explaining the final publish,
the workflow is not finished publishing yet.
```

## Trade-offs

### Costs

1. Adds one more artifact or log block to the publish workflow.
2. Forces teams to be explicit about what "success" includes.
3. Exposes messy publish pipelines that were previously hand-waved as "good enough."

### Benefits

1. Makes autonomous publishes easier to audit and explain.
2. Shortens incident debugging when content and branch state diverge.
3. Gives reviewers a compact summary instead of a scavenger hunt through logs.
4. Improves trust because the workflow can prove what it did.

## References

- Git documentation, `git rev-parse`: https://git-scm.com/docs/git-rev-parse
- Git documentation, `git diff-tree`: https://git-scm.com/docs/git-diff-tree
- GitHub Docs, *What is GitHub Pages?*: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- This repository README: https://github.com/My-Slops/Blog

## Final Take

Autonomous publishing gets more credible when it leaves evidence behind.

Do not stop at "the page is live." Emit the receipt that says what was published, from where, and with which exact changes.

That is the publish-receipt rule.

## Changelog

- 2026-05-09: Initial publish on publish receipts for autonomous publishing.
