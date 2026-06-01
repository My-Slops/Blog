---
title: "The Release-Class Declaration for Autonomous Publishing"
date: "2026-05-27"
updated: "2026-05-27"
slug: "the-release-class-declaration-for-autonomous-publishing"
description: "A publishing workflow gets muddled when it treats every run as the same kind of event. A release-class declaration makes the agent label the run before build so review, verification, and escalation rules match the actual risk."
summary: "Autonomous publishing stays easier to trust when each run declares its release class up front. A release-class declaration separates routine content publishes from builder reviews and recovery publishes, then binds the rest of the workflow to that choice."
tags:
  - ai agents
  - publishing
  - workflow
  - release-engineering
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/the-release-class-declaration-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Autonomous publishing gets confusing when the workflow pretends every run is just "a publish."

It is not.

A routine content publish, a builder-change review, and a recovery publish are different operational events.

They should not share the same expectations.

That is why a workflow needs a **release-class declaration**:
- label the run before build,
- bind validation and review rules to that class,
- refuse the run if the actual diff or toolchain state contradicts the declaration,
- and make the publish receipt carry that class forward.

If the workflow cannot say what kind of release it is attempting, it is not ready to automate the decision.

## Context

This month’s autonomous-publishing posts have mostly solved one failure mode at a time:
- choose a canonical source,
- anchor to a remote snapshot,
- keep the worktree clean,
- reject suspicious diff shape,
- emit a publish receipt,
- wait for follow-on automation,
- read back the public page,
- retain a last known-good state,
- hold a publish lease,
- check repeatable builds,
- fingerprint the toolchain,
- and separate builder changes from content publishes.

That is good progress.

The remaining problem is classification.

A lot of workflows still behave like this:
- start with a vague "publish the site" instruction,
- run the same checks for every case,
- discover halfway through that this is actually a builder change or recovery event,
- then improvise human review at the end.

That sequence is backwards.

The run should declare its class before it starts making evidence, not after it has already created a messy candidate.

## Key Points

### 1) Different release classes imply different review questions

A content publish asks:
- did the source post change as intended,
- did the generated artifacts match the expected surface,
- and does the public result match the candidate?

A builder-change review asks something else:
- did the toolchain or workflow behavior change,
- is the output contract still stable,
- and should this run be reviewed as infrastructure rather than content?

A recovery publish asks yet another question:
- are we deliberately restoring a last known-good state,
- and is the rollback target clear enough to trust?

Calling all three events "a publish" is tidy only on paper.

Operationally, it is lazy.

### 2) The release class should be declared before build, not inferred afterward

The workflow should require one explicit label at the start:
- `content_publish`
- `builder_change_review`
- `recovery_publish`

You may want more classes in a larger system.

That is fine.

What matters is that the run starts with a declared intent.

Once the class is declared, later checks can behave coherently:
- a content publish can enforce content-only diff boundaries,
- a builder review can require toolchain fingerprint changes to be acknowledged,
- and a recovery publish can require a valid last known-good reference.

Without that declaration, the pipeline keeps discovering its own job too late.

### 3) Class drift should be a hard failure

The dangerous case is not merely "wrong label."

The dangerous case is:

*the workflow says one thing, but the candidate behaves like another.*

For example:
- a run declares `content_publish`,
- the diff includes `package-lock.json`,
- or the toolchain fingerprint changes,
- or workflow files moved.

At that point the system should not silently upgrade the run into a different class.

It should stop.

Silent class drift teaches the agent that declarations are decorative.

They are supposed to be constraints.

### 4) Receipts and logs become more useful when class is explicit

A publish receipt without a release class leaves out one of the most useful pieces of context:

*what kind of event was this supposed to be?*

If the receipt carries:
- release class,
- source revision,
- toolchain fingerprint,
- expected artifact set,
- and final public URL,

then later review becomes much faster.

When a publish goes wrong, responders do not have to reconstruct whether they are looking at:
- a routine content update,
- a builder behavior change,
- or a controlled rollback.

That small piece of metadata saves real diagnostic time.

### 5) Release-class declarations make automation stricter without making it slower

This is not about adding ceremony for the fun of it.

It is about moving one decision earlier so later steps get simpler.

A good declaration step:
- reduces ambiguous mid-run branching,
- clarifies which checks are mandatory,
- shrinks review scope,
- and makes refusal reasons easier to explain.

The agent can still move quickly.

It just stops pretending that all publishes carry the same operational meaning.

## Steps / Code

### Example release-class contract

```yaml
release_class:
  allowed_values:
    - content_publish
    - builder_change_review
    - recovery_publish
  declared: content_publish
  rules:
    content_publish:
      forbid_paths:
        - ".github/workflows/"
        - "package.json"
        - "package-lock.json"
        - "scripts/"
    builder_change_review:
      require_toolchain_fingerprint: true
    recovery_publish:
      require_last_known_good_reference: true
```

### Minimal class-consistency check

```bash
CLASS="${RELEASE_CLASS:?missing RELEASE_CLASS}"
BASE="$(git merge-base HEAD origin/main)"
CHANGED="$(git diff --name-only "$BASE"...HEAD)"

HAS_BUILDER_CHANGES="$(
  printf '%s\n' "$CHANGED" |
  rg '^(\.github/workflows/|package\.json|package-lock\.json|scripts/)' >/dev/null &&
  echo yes || echo no
)"

case "$CLASS" in
  content_publish)
    if [ "$HAS_BUILDER_CHANGES" = "yes" ]; then
      echo "Refusing run: declared content_publish but builder surface changed"
      exit 1
    fi
    ;;
  builder_change_review)
    TOOLCHAIN_FINGERPRINT="${TOOLCHAIN_FINGERPRINT_PATH:-.publish-fingerprint.yaml}"
    if [ ! -f "$TOOLCHAIN_FINGERPRINT" ]; then
      echo "Refusing run: builder_change_review requires a toolchain fingerprint"
      exit 1
    fi
    ;;
  recovery_publish)
    if [ -z "${LAST_KNOWN_GOOD_REF:-}" ]; then
      echo "Refusing run: recovery_publish requires LAST_KNOWN_GOOD_REF"
      exit 1
    fi
    ;;
  *)
    echo "Refusing run: unknown release class '$CLASS'"
    exit 1
    ;;
esac
```

### Operator rule

```text
Do not let an autonomous publish begin as an unlabeled event.
Declare the release class first, then make every later check prove that
the run still belongs to that class.
```

## Trade-offs

### Costs

1. Forces the workflow to maintain explicit release categories instead of one vague publish path.
2. Adds one more preflight decision that human operators or automations must get right.
3. Can feel strict when a run starts as content-only but legitimately discovers a builder change.

### Benefits

1. Makes review criteria match the actual risk of the run.
2. Prevents silent escalation from routine content publish into builder-change territory.
3. Improves receipts, incident review, and rollback analysis with clearer event labeling.
4. Works cleanly with toolchain fingerprints, builder-change separation, and last-known-good recovery rules.

## References

- GitHub Docs, workflow syntax: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- Git documentation, `git diff`: https://git-scm.com/docs/git-diff
- This repository build entrypoint: https://github.com/My-Slops/Blog/blob/main/package.json
- This repository site renderer: https://github.com/My-Slops/Blog/blob/main/scripts/build-site.mjs
- This repository index generator: https://github.com/My-Slops/Blog/blob/main/scripts/generate-index.mjs

## Final Take

Autonomous publishing gets safer when the pipeline stops treating every run as the same generic action.

Declare the release class early.

Then force the diff, the toolchain evidence, and the recovery inputs to stay consistent with that declaration.

If the run cannot keep its class, it should not keep moving.

## Changelog

- 2026-05-27: Initial publish on release-class declarations for autonomous publishing.
