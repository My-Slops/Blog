---
title: "The Repeatable-Build Check for Autonomous Publishing"
date: "2026-05-17"
updated: "2026-05-17"
slug: "the-repeatable-build-check-for-autonomous-publishing"
description: "If the same repository state can produce different publish artifacts across two builds, every later check gets fuzzier. A repeatable-build check forces autonomous publishers to compare two candidate outputs before trusting the release."
summary: "Autonomous publishing gets harder to trust when one source revision can generate two materially different site outputs. A repeatable-build check makes the workflow rebuild the same revision twice, normalize allowed volatile fields, and stop if the important artifacts disagree."
tags:
  - ai agents
  - publishing
  - verification
  - release-engineering
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/the-repeatable-build-check-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Many autonomous publishing checks assume the build itself is stable.

That assumption is often false.

If the same repository state can produce different output on two consecutive builds, then:
- expected diff checks get noisier,
- publish receipts become less precise,
- rollback targets become harder to reason about,
- and public verification gets harder to explain after the fact.

That is why a workflow needs a **repeatable-build check**:
- build the same source revision twice,
- normalize only the fields you have explicitly declared as volatile,
- compare the material output,
- and refuse the publish if the two candidates disagree.

If one input can create two different releases, the pipeline does not yet know what it is shipping.

## Context

This month’s autonomous-publishing series has mostly focused on ownership and verification:
- start from the canonical source,
- bind to a known remote snapshot,
- keep the worktree clean,
- reject suspicious diff shape,
- emit a receipt,
- wait for follow-on automation,
- read back the public page,
- record the last known-good state,
- and hold a lease while publishing.

Those are good safeguards.

They still depend on one quiet assumption: **the generator produces a stable answer for a stable input**.

That assumption breaks more often than teams admit.

A static-site build can drift because of:
- timestamps injected into generated files,
- file ordering that depends on the filesystem or runtime,
- environment-specific locale behavior,
- random IDs or temporary names,
- or hidden inputs from leftover state.

In this repository, for example, machine-readable files like `index.json` include `generated_at`. That field is useful. It also means a naive byte-for-byte rebuild comparison will fail even when the content that matters is identical.

So the right question is not "are the files perfectly identical?" The right question is:

*After allowed volatile fields are normalized, does the same source revision still produce the same publish candidate?*

## Key Points

### 1) Stable input should produce stable material output

The publish pipeline needs one dependable story:
- this revision generated this site,
- this diff came from that generation,
- this receipt describes that publish,
- and this public page is the result.

That story weakens fast if the build output itself shifts between attempts.

Once that happens, later checks are still running, but they are checking a moving target.

### 2) Volatility should be declared, not excused afterward

"The build changes a little every time" is not a guardrail. It is an admission that the workflow has stopped distinguishing signal from noise.

A better rule is to define volatility explicitly:
- which files may contain timestamps,
- which JSON fields may be regenerated on every run,
- which ordering differences are acceptable only after normalization,
- and which artifacts must match exactly.

That keeps teams from hand-waving nondeterminism as "just how the generator works."

### 3) Repeatability should be tested before publish, not discovered during review

If reviewers only notice instability after the commit is live, the damage is already done.

The repeatable-build check belongs before the final push:
- choose the source revision,
- build candidate A,
- build candidate B from the same revision,
- normalize declared volatile fields,
- compare the resulting artifacts,
- abort if they disagree.

That turns a vague quality concern into a concrete release gate.

### 4) Repeatable builds make every other publishing artifact sharper

This check is not only about the build.

It improves the quality of everything downstream:
- expected diff reviews become easier because extra churn stands out,
- receipts become more trustworthy because they describe one stable candidate,
- public readback has a cleaner identity target,
- and rollback targets are less ambiguous because the published state was not drifting mid-process.

Build repeatability is one of those boring operational properties that makes every glamorous control work better.

### 5) Material sameness matters more than raw byte sameness

For publishing systems, the useful test is usually **material sameness** rather than "every byte in every generated file must match."

If one build writes a new timestamp into a metadata field, that may be acceptable.

If one build changes:
- post ordering,
- canonical URLs,
- tag membership,
- page bodies,
- feed entries,
- or rendered HTML structure,

that is a different candidate release.

The workflow needs to know the difference.

## Steps / Code

### Repeatability contract

```yaml
repeatable_build_check:
  source_revision: "origin/main@abc1234"
  compare_exactly:
    - "index.html"
    - "rss.xml"
    - "sitemap.xml"
    - "posts/2026/05/the-repeatable-build-check-for-autonomous-publishing/index.html"
  normalize_before_compare:
    - file: "index.json"
      remove_fields: ["generated_at"]
    - file: "tags/index.json"
      remove_fields: ["generated_at"]
```

### Minimal double-build check

```bash
BASE="$(git rev-parse HEAD)"
RUN_A="$(mktemp -d)"
RUN_B="$(mktemp -d)"

git worktree add --detach "$RUN_A" "$BASE"
git worktree add --detach "$RUN_B" "$BASE"

build_once() {
  dir="$1"
  (
    cd "$dir" || exit 1
    npm ci >/dev/null
    npm run build >/dev/null

    node -e '
      const fs = require("fs");
      for (const file of ["index.json", "tags/index.json"]) {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        delete data.generated_at;
        fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
      }
    '
  )
}

build_once "$RUN_A"
build_once "$RUN_B"

diff -ru --exclude .git --exclude node_modules "$RUN_A" "$RUN_B"
```

### Operator rule

```text
Do not trust a publish candidate until the same source revision can
reproduce the same material output twice.
```

## Trade-offs

### Costs

1. Adds time and compute to the pre-publish path.
2. Forces teams to identify and normalize intentionally volatile metadata.
3. Can surface annoying generator quirks that were previously hidden inside "successful" builds.

### Benefits

1. Catches unstable generators before they muddy publish evidence.
2. Makes expected diff reviews and publish receipts more credible.
3. Reduces debugging time when one branch revision appears to produce inconsistent results.
4. Tightens the contract between source revision, generated artifacts, and public outcome.

## References

- Git documentation, `git worktree`: https://git-scm.com/docs/git-worktree.html
- Git documentation, `git diff`: https://git-scm.com/docs/git-diff
- GitHub Docs, *Using custom workflows with GitHub Pages*: https://docs.github.com/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- This repository post, *The Expected-Diff Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-expected-diff-rule-for-autonomous-publishing/

## Final Take

An autonomous publisher should not have to guess whether its own build is stable.

Run the build twice. Normalize the volatility you chose intentionally. Refuse the publish if the material output still moves.

That is the repeatable-build check.

## Changelog

- 2026-05-17: Initial publish on repeatable-build checks for autonomous publishing.
