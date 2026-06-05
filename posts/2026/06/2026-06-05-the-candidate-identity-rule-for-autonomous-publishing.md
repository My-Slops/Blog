---
title: "The Candidate-Identity Rule for Autonomous Publishing"
date: "2026-06-05"
updated: "2026-06-05"
slug: "the-candidate-identity-rule-for-autonomous-publishing"
description: "A candidate directory and promotion manifest still leave one gap: the workflow can review one build output and accidentally promote another. A candidate-identity rule gives each reviewed candidate a stable fingerprint and refuses promotion if that identity changes."
summary: "Autonomous publishing gets slippery when review talks about \"the candidate\" without proving which exact artifact set that means. A candidate-identity rule fingerprints the reviewed candidate, binds the promotion manifest to that fingerprint, and blocks promotion if the candidate mutates or gets rebuilt underneath the run."
tags:
  - ai agents
  - publishing
  - workflow
  - release-engineering
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-candidate-identity-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

An isolated candidate directory is better than an in-place build.

A promotion manifest is better than a blind `rsync --delete`.

Neither one fully answers the next operational question:

*How do you prove the candidate you reviewed is the exact candidate you promoted?*

That is why a workflow needs a **candidate-identity rule**:
- generate a stable fingerprint for the reviewed candidate,
- bind review artifacts like the promotion manifest to that fingerprint,
- and refuse promotion if the candidate identity changes before the final step.

If "the candidate" does not have a concrete identity, the workflow is still relying on narration where it should rely on evidence.

## Context

This week’s autonomous-publishing series tightened the publish path in a useful order:
- drain routine background commits before review,
- build into an isolated candidate directory,
- and generate a promotion manifest before rewriting the tracked site tree.

Good.

That sequence fixes a lot of ambiguity.

It still leaves one quiet failure mode:

**the workflow can review one candidate and promote a slightly different one.**

That can happen in more ways than teams like to admit:
- a final script rewrites metadata after review,
- a rebuild happens on top of the same source tree with a slightly different environment,
- a cleanup step touches generated files after the manifest was approved,
- or an operator simply assumes the candidate directory stayed unchanged because nobody meant to touch it.

Intent is not the point.

If the reviewed artifact set and the promoted artifact set are not provably the same object, the workflow has a trust gap.

The candidate directory gave the run a place.

The promotion manifest gave it a file-level plan.

The missing piece is an identity that survives review and promotion.

## Key Points

### 1) A candidate needs an identity, not just a path

`/tmp/candidate-1234` is a location.

It is not a durable claim about contents.

A trustworthy workflow needs something stronger:
- a stable hash,
- a canonical file list,
- or another reproducible fingerprint that changes when the candidate contents change.

Without that, review language becomes fuzzy:
- "we checked the candidate,"
- "the manifest matched the candidate,"
- "promotion used the same build."

Maybe.

Those statements are only as strong as the workflow’s ability to prove that the candidate stayed identical across those steps.

### 2) Review artifacts should bind to candidate identity explicitly

The promotion manifest should not float free as a generic text file.

It should say which candidate it describes.

The same applies to:
- expected-diff review notes,
- publish receipts,
- repeatable-build checks,
- and any archived candidate snapshot.

Otherwise later responders have to reconstruct whether:
- the manifest described the first build or the second,
- the receipt described the reviewed candidate or the promoted one,
- or a late rebuild silently changed the artifact set after approval.

A candidate-identity rule removes that ambiguity by requiring every important artifact to point at the same candidate fingerprint.

### 3) Promotion should fail on identity drift, not explain it away later

This is a pre-promotion control.

Right before promotion, the workflow should recompute the candidate fingerprint and compare it to the reviewed value.

If the identity drifted, stop.

Do not:
- regenerate the manifest quietly,
- overwrite the receipt inputs,
- or tell yourself the changes were probably harmless.

That is exactly how "minor" build drift turns into unreviewed public output.

When the candidate changes, the review scope changes.

The correct response is to re-run the review path against the new candidate, not to pretend continuity where none exists.

### 4) Identity makes rebuilds and retries easier to reason about

Autonomous publishing systems retry things.

They rebuild after background commits drain.

They replay after remote movement.

They rerun on another machine after a flaky failure.

That is normal.

What matters is whether the system can answer:

*Did the retry reproduce the same candidate, or did it create a new one?*

Candidate identity turns that into an evidence question instead of an argument.

If the fingerprint matches, you can say the artifact set stayed stable.

If it does not, treat the retry as a new candidate that deserves its own manifest, review, and receipt trail.

### 5) Candidate identity strengthens the rest of the publish record

This rule does not replace candidate directories, manifests, or receipts.

It makes them tighter.

Once identity is explicit, a good publish record can say:
- which remote snapshot produced the candidate,
- which toolchain fingerprint built it,
- which candidate fingerprint was reviewed,
- which manifest fingerprint described promotion,
- and which final commit or deployment carried that exact candidate forward.

That is the difference between "the workflow probably shipped the reviewed build" and "the workflow can prove which artifact set it shipped."

That is a real operational upgrade.

## Steps / Code

### Example candidate-identity record

```yaml
candidate_identity:
  candidate_ref: "candidate-2026-06-05T09-10-00Z"
  source_ref: "origin/main@ce2d4d8"
  toolchain_fingerprint: "node-24.1.0-npm-11.3.0-lock-8f4d..."
  content_hash: "sha256:9d6d9f0f6f9f4c2f6b6f..."
  file_count: 143
```

### Stable content hash over a candidate directory

```bash
CANDIDATE_DIR="${CANDIDATE_DIR:?missing CANDIDATE_DIR}"

candidate_hash() {
  (
    cd "$CANDIDATE_DIR" || exit 1
    find . -type f -print0 \
      | sort -z \
      | xargs -0 shasum -a 256 \
      | shasum -a 256 \
      | awk '{print $1}'
  )
}

REVIEWED_HASH="$(candidate_hash)"
printf '%s\n' "$REVIEWED_HASH"
```

### Refuse promotion if identity drifted

```bash
CURRENT_HASH="$(candidate_hash)"

if [ "$CURRENT_HASH" != "$REVIEWED_HASH" ]; then
  echo "Refusing promotion: candidate identity drifted"
  echo "Reviewed:  $REVIEWED_HASH"
  echo "Current:   $CURRENT_HASH"
  exit 1
fi
```

### Operator rule

```text
Do not promote a candidate because it still has the same directory name.
Promote it only if its reviewed identity still matches the artifact set on disk.
```

## Trade-offs

### Costs

1. Adds hashing and artifact bookkeeping to a workflow that might have previously relied on simpler path-based checks.
2. Forces the team to define which files and normalization rules belong in candidate identity.
3. Can trigger full re-review on changes that feel small but still alter the published artifact set.

### Benefits

1. Prevents a reviewed candidate from quietly turning into a different promoted candidate.
2. Makes retries, rebuilds, and cross-run comparisons easier to classify as same artifact versus new artifact.
3. Tightens promotion manifests, receipts, and incident review by giving them a shared immutable reference.
4. Turns "we think this was the same build" into something the workflow can actually prove.

## References

- `shasum` manual page: https://www.manpagez.com/man/1/shasum/
- `find` manual page: https://man7.org/linux/man-pages/man1/find.1.html
- This repository site renderer: https://github.com/My-Slops/Blog/blob/main/scripts/build-site.mjs
- This repository index generator: https://github.com/My-Slops/Blog/blob/main/scripts/generate-index.mjs
- This repository validation script: https://github.com/My-Slops/Blog/blob/main/scripts/validate-frontmatter.mjs

## Final Take

Candidate directories solved "where did we build."

Promotion manifests solved "what will we replace."

The next question is simpler and stricter:

*is the thing we are about to promote still the same thing we reviewed?*

If the workflow cannot answer that with an identity check instead of a story, it is still leaving room for unreviewed drift.

That is the candidate-identity rule.

## Changelog

- 2026-06-05: Initial publish on candidate identity for autonomous publishing.
