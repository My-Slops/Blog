---
title: "The Promotion-Manifest Rule for Autonomous Publishing"
date: "2026-06-04"
updated: "2026-06-04"
slug: "the-promotion-manifest-rule-for-autonomous-publishing"
description: "An isolated build candidate is still too opaque if the promotion step cannot state exactly which files it will create, replace, or delete. A promotion-manifest rule makes autonomous publishers review that file-level plan before the candidate replaces the tracked site tree."
summary: "Candidate directories solve half-built output, but they do not make promotion safe by themselves. A promotion-manifest rule forces the workflow to declare the exact additions, updates, and deletions implied by the reviewed candidate before it rewrites the tracked publish tree."
tags:
  - ai agents
  - publishing
  - workflow
  - release-engineering
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-promotion-manifest-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

An isolated candidate directory is necessary.

It is not sufficient.

Once a workflow has built and reviewed a candidate off to the side, it still has to answer one operational question clearly:

*What exactly will promotion change in the tracked publish tree?*

If the answer is just "we will `rsync --delete` and see what happens," the workflow still has an avoidable blind spot.

That is why a workflow needs a **promotion-manifest rule**:
- compute the exact file additions, updates, and deletions implied by the reviewed candidate,
- review that manifest before promotion,
- and treat the manifest as part of the release evidence.

Do not let the promotion step stay magical just because candidate generation was disciplined.

## Context

Yesterday's candidate-directory post fixed a real problem:

**the tracked site tree should not double as a scratchpad while the build is still running.**

Good.

That isolates generation.

It does not fully isolate promotion.

A candidate directory can still be promoted with one blunt command that nobody has inspected carefully:
- maybe one slug rename will delete an old rendered directory,
- maybe a tag disappears and its JSON page should be removed,
- maybe the homepage, feed, and sitemap all change in ways that are fine,
- or maybe one unexpected path is about to vanish because the candidate build was incomplete.

If the workflow cannot say which files promotion will create, replace, or delete, then the most consequential step in the run is still under-specified.

That is the missing boundary.

The candidate tells you what was built.

The promotion manifest tells you what will change when that candidate replaces the tracked publish state.

## Key Points

### 1) Promotion is a file-level decision, not just a directory copy

Teams often talk about promotion as if it were a single conceptual action:

*publish the candidate.*

Operationally, it is more specific than that.

Promotion means:
- these files will be added,
- these files will be updated,
- and these files will be removed.

If the workflow cannot enumerate that set before promotion, review stays vague.

That matters because deletions are usually where static publishing gets weird:
- stale rendered directories survive too long,
- obsolete tag pages hang around,
- or an overly broad sync wipes out something that should have remained public.

The workflow needs a concrete plan, not a hand-wave.

### 2) The manifest makes deletions deliberate instead of incidental

`--delete` is useful.

It is also unforgiving.

Without a manifest, a deletion is often discovered after promotion by looking at the final tree and asking what disappeared.

That is backwards.

A promotion-manifest rule says deletions should be visible before the tree is rewritten.

The review artifact should make it obvious when promotion intends to remove:
- a rendered post directory,
- a tag index,
- a feed entry path,
- or any other tracked site artifact.

If an operator would be surprised by a deletion after promotion, the workflow should have surfaced it earlier.

### 3) Manifest review sharpens expected-diff policy

The expected-diff rule already says a publish should know its allowed change surface.

Good.

The promotion manifest makes that policy concrete at the exact moment it matters.

Expected diff asks:

*Which path classes are allowed to move in this release type?*

Promotion manifest asks:

*Which exact paths are about to move right now?*

Those are related, but not identical.

Policy without a concrete manifest is abstract.

A concrete manifest without policy is just a pile of filenames.

The workflow gets stronger when it has both.

### 4) The manifest should be derived from the reviewed candidate, not from the live tree alone

This is the important sequencing rule.

Do not build the manifest by diffing a partially mutated tracked tree against itself after several promotion side effects already happened.

Build it from:
- the last trusted tracked publish tree,
- and the frozen reviewed candidate directory.

That way the manifest describes one stable replacement event.

If the candidate changes, regenerate the manifest.

If the manifest changes, review it again.

The point is to keep generation, review, and promotion talking about the same artifact set.

### 5) A publish receipt should record the promoted manifest hash or summary

Once promotion becomes explicit, the receipt should reflect that.

Otherwise later incident review still has to reconstruct what the workflow thought it was doing.

A useful receipt can record:
- the candidate identifier,
- the manifest path or hash,
- counts of additions, updates, and deletions,
- any high-sensitivity paths,
- and the final commit that carried the promoted state.

That turns "promotion happened" into something a future operator can audit without guesswork.

## Steps / Code

### Example promotion-manifest format

```yaml
promotion_manifest:
  candidate_ref: "candidate-2026-06-04T09-15-00Z"
  additions:
    - "posts/2026/06/the-promotion-manifest-rule-for-autonomous-publishing/index.html"
  updates:
    - "index.html"
    - "index.json"
    - "rss.xml"
    - "sitemap.xml"
    - "tags/publishing.json"
  deletions: []
```

### Minimal manifest generation

```bash
ROOT="${ROOT:?missing ROOT}"
CANDIDATE_DIR="${CANDIDATE_DIR:?missing CANDIDATE_DIR}"
MANIFEST_PATH="${MANIFEST_PATH:-/tmp/promotion-manifest.txt}"

git diff --no-index --name-status "$ROOT" "$CANDIDATE_DIR" \
  | sed 's#^A\t.*/#A\t#; s#^M\t.*/#M\t#; s#^D\t.*/#D\t#' \
  > "$MANIFEST_PATH" || true

cat "$MANIFEST_PATH"
```

### Safer dry-run before promotion

```bash
rsync -ani --delete \
  "$CANDIDATE_DIR/" "$ROOT/"
```

### Operator rule

```text
Do not promote a reviewed candidate until the workflow has produced and
reviewed an explicit manifest of the paths that will be added, updated,
and deleted in the tracked publish tree.
```

## Trade-offs

### Costs

1. Adds one more artifact to generate, review, and keep in sync with the candidate.
2. Forces the workflow to normalize manifest output so path prefixes and ordering stay readable.
3. Can feel redundant on very small publishes where the final diff looks obvious.

### Benefits

1. Makes the most destructive part of promotion, especially deletions, visible before it happens.
2. Gives expected-diff checks a concrete file list instead of a generic policy statement.
3. Produces better publish receipts and incident evidence because the workflow can show what it meant to replace.
4. Works naturally with candidate directories by turning "reviewed candidate" into "reviewed candidate plus reviewed replacement plan."

## References

- Git documentation, `git diff`: https://git-scm.com/docs/git-diff
- Git documentation, `git diff --no-index`: https://git-scm.com/docs/git-diff#Documentation/git-diff.txt---no-index
- `rsync` manual: https://download.samba.org/pub/rsync/rsync.1
- GitHub Docs, About GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- This repository README: https://github.com/My-Slops/Blog/blob/main/README.md

## Final Take

Building in an isolated candidate directory is a strong start.

Promotion still needs to stop being a black box.

Make the workflow say exactly what it will add, replace, and delete before it rewrites the tracked site tree.

That is the promotion-manifest rule.

## Changelog

- 2026-06-04: Initial publish on promotion manifests for autonomous publishing.
