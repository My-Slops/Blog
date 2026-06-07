---
title: "The Candidate-Seal Rule for Autonomous Publishing"
date: "2026-06-07"
updated: "2026-06-07"
slug: "the-candidate-seal-rule-for-autonomous-publishing"
description: "A candidate fingerprint tells you when the reviewed build changed, but it still leaves promotion dependent on a mutable directory. A candidate-seal rule turns the reviewed candidate into one immutable artifact and promotes only from that sealed object."
summary: "Autonomous publishing gets tighter when review ends by sealing the candidate into one immutable artifact. A candidate-seal rule binds review to that sealed object, blocks rebuilds or directory drift before promotion, and makes retries easier to reason about across machines and reruns."
tags:
  - ai agents
  - publishing
  - workflow
  - release-engineering
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-candidate-seal-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

An isolated candidate directory is better than building in place.

A promotion manifest is better than a blind copy.

A candidate identity is better than trusting the directory name.

There is still one awkward detail:

**the reviewed candidate usually lives in a mutable working directory right up until promotion.**

That is why a workflow needs a **candidate-seal rule**:
- turn the reviewed candidate into one immutable artifact,
- bind the manifest and receipt to that sealed object,
- and promote only from the seal, not from a directory that can still drift.

If the workflow reviews one candidate but promotes from a mutable workspace, it is still giving last-minute state changes too much room to hide.

## Context

This week's autonomous-publishing series has tightened the release path in a sensible order:
- drain allowed background commits before final review,
- build into an isolated candidate directory,
- generate a promotion manifest for the exact file-level replacement,
- and fingerprint the candidate so the workflow can detect identity drift.

That is already much better than an in-place build followed by optimism.

It still leaves one practical weakness:

**the candidate often remains a normal directory on a normal filesystem until the publish finishes.**

That sounds harmless until you remember how many things can still touch it:
- a late rebuild,
- an over-eager cleanup step,
- a permissions fix,
- a second process reusing the same path,
- or a retry on another machine that recreates "the same" candidate from scratch.

Yes, the candidate-identity rule can detect some of this.

Detection is good.

But once review is complete, the safer move is to stop treating the candidate as a live workspace at all.

Seal it.

Promote from the sealed artifact.

Make every later step prove that it is still handling the exact reviewed object.

## Key Points

### 1) A reviewed candidate should graduate from directory to artifact

Directories are convenient build surfaces.

They are not ideal release surfaces.

Once review is done, the workflow should package the candidate into one sealed object:
- a tarball,
- a content-addressed archive,
- or another immutable artifact format the system can hash and store reliably.

That changes the operational question.

Instead of asking:

*Is this still probably the same directory we reviewed?*

the workflow can ask:

*Is this the exact sealed artifact we approved?*

That is a cleaner question with a cleaner answer.

### 2) The seal should bind together identity, manifest, and approval evidence

The seal is not just compression.

It is the point where several earlier controls can finally share one stable reference:
- the candidate content hash,
- the promotion manifest hash,
- the source snapshot,
- the toolchain fingerprint,
- and the approval or receipt record.

Without a seal, those artifacts still orbit a mutable directory path.

With a seal, they can all point at one immutable object identifier.

That matters later when someone asks:
- which candidate was reviewed,
- which manifest described it,
- and which exact object promotion consumed.

The answer should be one artifact reference, not a story about temporary folders.

### 3) Promotion should unpack from the sealed object, not rebuild from memory

This is the operational heart of the rule.

If promotion begins by re-running the builder, regenerating the candidate, or trusting a still-open directory, then the workflow has reopened the exact gap it just worked to close.

Promotion should use the sealed candidate as its source of truth:
- verify the seal hash,
- unpack it into a fresh promotion directory,
- verify the unpacked content still matches the recorded identity,
- then apply the reviewed manifest.

That sequence makes promotion a transfer problem, not a rebuild problem.

The reviewed object should move forward.

It should not be reimagined at the finish line.

### 4) Seals make retries and cross-machine replays less ambiguous

Autonomous publishers rarely live on one machine forever.

Runs retry.

Runners disappear.

Promotion sometimes has to resume on different infrastructure after review already happened.

Without a seal, teams end up arguing about whether a recreated directory is "basically the same candidate."

That is weak language.

A sealed artifact makes the replay story much stronger:
- fetch the same sealed candidate,
- verify the same archive hash,
- unpack the same contents,
- and continue with the same manifest and receipt inputs.

If the replay needs a new build, fine.

Then it is a new candidate and it deserves a new identity, a new seal, and a new review trail.

### 5) The publish receipt should record the seal reference explicitly

The publish receipt already answers what was shipped.

The candidate-seal rule makes that answer sharper.

A strong receipt should record:
- the candidate identity hash,
- the seal artifact hash,
- where the seal was stored,
- the manifest hash,
- and the final commit or deployment that consumed it.

That gives incident review one unambiguous bridge from review to promotion.

It also prevents a common audit failure where the system can show the final commit and the original review notes but cannot prove which exact candidate artifact connected the two.

The seal is that bridge.

## Steps / Code

### Example sealed-candidate record

```yaml
candidate_seal:
  candidate_ref: "candidate-2026-06-07T09-14-00Z"
  source_ref: "origin/main@650e359"
  candidate_hash: "sha256:9d6d9f0f6f9f4c2f6b6f..."
  manifest_hash: "sha256:2cbf145f0d1d1b2b35a1..."
  archive_path: "artifacts/candidate-2026-06-07T09-14-00Z.tgz"
  archive_hash: "sha256:3f8e8caa3f6f8de6d57b..."
```

### Seal the reviewed candidate into one archive

```bash
CANDIDATE_DIR="${CANDIDATE_DIR:?missing CANDIDATE_DIR}"
ARCHIVE_PATH="${ARCHIVE_PATH:?missing ARCHIVE_PATH}"

(
  cd "$CANDIDATE_DIR" || exit 1
  tar \
    --sort=name \
    --mtime='UTC 2026-06-07' \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -czf "$ARCHIVE_PATH" .
)

ARCHIVE_HASH="$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')"
printf '%s\n' "$ARCHIVE_HASH"
```

### Refuse promotion if the sealed artifact changed

```bash
REVIEWED_ARCHIVE_HASH="${REVIEWED_ARCHIVE_HASH:?missing REVIEWED_ARCHIVE_HASH}"
CURRENT_ARCHIVE_HASH="$(shasum -a 256 "$ARCHIVE_PATH" | awk '{print $1}')"

if [ "$CURRENT_ARCHIVE_HASH" != "$REVIEWED_ARCHIVE_HASH" ]; then
  echo "Refusing promotion: sealed candidate hash drifted"
  echo "Reviewed:  $REVIEWED_ARCHIVE_HASH"
  echo "Current:   $CURRENT_ARCHIVE_HASH"
  exit 1
fi
```

### Promote by unpacking the seal into a fresh directory

```bash
PROMOTION_DIR="$(mktemp -d)"
trap 'rm -rf "$PROMOTION_DIR"' EXIT

tar -xzf "$ARCHIVE_PATH" -C "$PROMOTION_DIR"

rsync -a --delete \
  "$PROMOTION_DIR/" "$ROOT/"
```

### Operator rule

```text
Once a candidate has been reviewed, freeze it into one immutable artifact
and promote only from that sealed object.
```

## Trade-offs

### Costs

1. Adds archive creation, storage, and retention work to a pipeline that previously promoted directly from a directory.
2. Forces the workflow to define deterministic packaging rules so seal hashes stay meaningful across runs.
3. Introduces another artifact that can fail to upload, expire, or require cleanup policy.

### Benefits

1. Shrinks the mutable surface between review and promotion.
2. Gives identity, manifest, approval, and receipt records one shared immutable reference.
3. Makes retries and cross-machine promotion easier to classify as same reviewed artifact versus new candidate.
4. Turns "we promoted the reviewed build" from a directory-based assumption into an artifact-based proof.

## References

- GNU Tar Manual: https://www.gnu.org/software/tar/manual/
- `shasum` manual page: https://www.manpagez.com/man/1/shasum/
- GitHub Docs, *Store and share data with workflow artifacts*: https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-what-your-workflow-does/storing-and-sharing-data-from-a-workflow
- This repository post, *The Candidate-Identity Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-candidate-identity-rule-for-autonomous-publishing/

## Final Take

Candidate identity is a strong detection control.

The next step is to stop depending on a mutable candidate directory after review is finished.

Seal the reviewed candidate into one immutable object. Bind the rest of the release evidence to that object. Promote only from that seal.

That is the candidate-seal rule.

## Changelog

- 2026-06-07: Initial publish on sealing reviewed candidates for autonomous publishing.
