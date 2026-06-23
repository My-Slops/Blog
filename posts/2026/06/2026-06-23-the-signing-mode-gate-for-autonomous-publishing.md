---
title: "The Signing-Mode Gate for Autonomous Publishing"
date: "2026-06-23"
updated: "2026-06-23"
slug: "the-signing-mode-gate-for-autonomous-publishing"
description: "Autonomous publishing runs should decide their commit-signing mode before they draft, replay, or push. A signing-mode gate keeps signed, unsigned, and blocked paths explicit so inherited Git state does not quietly change the release policy mid-run."
summary: "Commit signing should not be an ambient surprise in autonomous publishing. A signing-mode gate chooses signed, unsigned, or blocked mode up front, counters inherited replay state explicitly, and records that choice in the publish receipt."
tags:
  - ai agents
  - publishing
  - workflow
  - security
  - release-engineering
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-signing-mode-gate-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Commit signing is too important to leave ambient.

A publish run can have:
- the right post,
- the right workspace,
- the right remote baseline,
- and a passing build,

then still fail because signing mode was never decided explicitly.

That failure shows up in a few familiar ways:
- the repository or global Git config wants signed commits,
- a replay step continues in signed mode because that is how it started,
- the automation environment has no usable signing agent,
- and the run discovers all of this halfway through a rebase or commit sequence.

That is why a workflow needs a **signing-mode gate**:
- decide whether this run is **signed**, **unsigned**, or **blocked** before mutating publish state,
- make commit and replay commands express that mode explicitly,
- refuse to let inherited Git state quietly pick the policy for you,
- and record the chosen mode in the publish receipt.

If signing is part of provenance, then signing mode is part of release eligibility.

## Context

This autonomous-publishing series already covered a lot of the obvious reliability controls:
- workspace selection,
- remote reachability,
- remote-baseline rebuilds,
- repeatable builds,
- and publish receipts.

Good.

Those controls still leave one operational trap:

**the workflow may not have an explicit answer to "how are commits in this run supposed to be signed?"**

That sounds narrow until it breaks at the wrong time.

A normal authoring flow might tolerate some ambiguity because a human notices the prompt, unlocks a key, or decides to retry later.

Automation is worse at that class of surprise.

An agent can do everything else correctly, then stall because:
- `commit.gpgSign` is enabled somewhere above the repo,
- a replay step was launched with signing on and continues that way,
- the signing key exists but the agent is unavailable,
- or the repository policy allows unsigned mechanical replay but the workflow never said so out loud.

Now the run has a half-finished history operation and no clean story about whether it is failing for:
- content reasons,
- transport reasons,
- or provenance-policy reasons.

That ambiguity is avoidable.

Commit signing is not just a Git preference.

In an autonomous publisher, it is a release-mode decision.

## Key Points

### 1) Signing policy is separate from content readiness

A publish is not ready just because:
- the post is written,
- the diff looks right,
- and `npm run build` passed.

It also has to satisfy the provenance policy for the release path it is using.

That policy might be:
- every publish commit must be signed,
- only final publish commits must be signed,
- replay commits may be unsigned but must be labeled,
- or this repository deliberately allows unsigned commits for automation.

Those are different policies.

What matters is not which one you choose.

What matters is that the workflow chooses one deliberately before the first commit, cherry-pick, or rebase step starts manufacturing history.

Otherwise signing mode becomes an accident of:
- global Git config,
- local repo overrides,
- wrapper scripts,
- or whatever state the previous operator left behind.

That is not governance.

That is drift.

### 2) Replay work needs its own signing decision

This is the part teams skip.

They think about signing for the final commit, but not for the recovery path that gets the final commit onto the current branch tip.

That is a mistake.

Replay steps are exactly where signing assumptions get messy:
- `origin/main` moved,
- a publish commit must be rebased or cherry-picked,
- the workflow is performing a mechanical history operation rather than fresh authorship,
- and the runner may not have the same signing capabilities as a human laptop.

If the workflow allows unsigned replay but requires a signed final publish, say so.

If the workflow requires every replayed commit to stay signed, say that too.

What should not happen is a replay silently inheriting a signing mode that nobody intended for this run.

Mechanical recovery steps are still policy-bearing actions.

Treat them that way.

### 3) Explicit command flags beat ambient Git behavior

Git already gives you the right control surface.

`commit.gpgSign` can enable signing by default.

`git commit` supports both `--gpg-sign` and `--no-gpg-sign`.

`git rebase` does too, and the official documentation explicitly describes `--no-gpg-sign` as a way to countermand both `commit.gpgSign` and earlier signing choices.

That means the workflow should stop hoping the environment happens to be right.

Write the mode into the command:
- signed commit path: use `git commit -S`
- unsigned commit path: use `git commit --no-gpg-sign`
- signed replay path: use `git rebase --gpg-sign`
- unsigned replay path: use `git rebase --no-gpg-sign`

The principle is simple:

**if signing mode matters, it belongs in the operation, not only in the ambient config.**

That makes replay behavior legible in logs and much easier to reason about during incident review.

### 4) "Unsigned" is only acceptable when it is a named mode, not an accidental fallback

Some teams hear "unsigned replay" and treat it as automatically sloppy.

Not necessarily.

Unsigned replay can be a valid mode if:
- the repository policy permits it,
- the scope is narrow,
- the receipt records it,
- and the workflow does not pretend the result was signed when it was not.

What is sloppy is the accidental version:
- signing was expected but not available,
- the workflow silently dropped it,
- or an operator hacked around the failure without updating the publish story.

That is the difference between a mode and a mistake.

A good signing-mode gate usually supports three outcomes:

**Signed mode**

The required key and agent are available. Commits and replay steps use explicit signing flags.

**Unsigned mode**

Policy allows unsigned automation for this release class. The workflow countersigns nothing by accident, disables signing explicitly, and labels the publish accordingly.

**Blocked mode**

The release class requires signing, but the runner cannot satisfy that requirement. Stop before creating more release-shaped local state.

Those outcomes are much cleaner than the usual fourth mode:

*surprised mode.*

### 5) The publish receipt should record the signing decision

Once signing mode becomes a first-class gate, the publish receipt should say:
- which mode the run selected,
- whether that mode came from repository policy or operator override,
- whether replay steps were signed or explicitly unsigned,
- what command path was used,
- and whether the run was blocked because signing requirements were unavailable.

This matters because "commit failed" is not a useful incident category.

You want to know whether the failure was:
- missing signing key material,
- unavailable signing agent,
- an unintended inherited signing mode,
- or a deliberate policy block.

Those are different operational problems.

The receipt should keep them separate.

## Steps / Code

### Example signing-mode policy

```yaml
signing_mode:
  publish_commits: "signed"
  replay_commits: "unsigned"
  allow_unsigned_automation: true
  on_missing_signing_capability:
    signed_publish: "blocked"
    unsigned_replay: "allowed_with_receipt"
```

### Minimal mode selection

```bash
set -euo pipefail

PUBLISH_SIGNING_MODE="${PUBLISH_SIGNING_MODE:-signed}"
REPLAY_SIGNING_MODE="${REPLAY_SIGNING_MODE:-unsigned}"

commit_with_mode() {
  local message="$1"

  case "$PUBLISH_SIGNING_MODE" in
    signed)
      git commit -S -m "$message"
      ;;
    unsigned)
      git commit --no-gpg-sign -m "$message"
      ;;
    blocked)
      echo "publish blocked by signing policy" >&2
      exit 1
      ;;
  esac
}

replay_onto_main() {
  case "$REPLAY_SIGNING_MODE" in
    signed)
      git rebase --gpg-sign origin/main
      ;;
    unsigned)
      git rebase --no-gpg-sign origin/main
      ;;
    blocked)
      echo "replay blocked by signing policy" >&2
      exit 1
      ;;
  esac
}
```

### Operator rule

```text
Before an autonomous publish creates or replays commits, decide whether the run is
using signed, unsigned, or blocked mode. Express that choice directly in commit and
rebase commands so inherited Git state cannot quietly redefine provenance policy.
```

## Trade-offs

### Costs

1. Forces teams to define a real signing policy instead of leaning on ambient Git defaults.
2. Adds another preflight decision point before commit or replay operations.
3. Makes some previously "convenient" unsigned recoveries impossible when the release class truly requires signing.

### Benefits

1. Prevents automation from discovering signing-policy failures halfway through history repair.
2. Separates provenance-policy failures from content, build, and transport failures.
3. Makes replay behavior explicit, which is where many signing surprises actually happen.
4. Produces cleaner incident records because signed, unsigned, and blocked runs are distinct states rather than vague commit errors.

## References

- Git documentation, `git-config` (`commit.gpgSign`): https://git-scm.com/docs/git-config
- Git documentation, `git-commit` (`--gpg-sign`, `--no-gpg-sign`): https://git-scm.com/docs/git-commit
- Git documentation, `git-rebase` (`--gpg-sign`, `--no-gpg-sign`): https://git-scm.com/docs/git-rebase
- This repository post, *The Remote-Reachability Gate for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-remote-reachability-gate-for-autonomous-publishing/
- This repository post, *The Publish Receipt Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/05/the-publish-receipt-rule-for-autonomous-publishing/

## Final Take

Commit signing is too meaningful to leave implicit.

If a workflow cares about provenance, it should say so before it starts writing history.

Pick the mode.
Write the mode into the commands.
Record the mode in the receipt.

Then a failed publish means something precise instead of "Git got weird again."

## Changelog

- 2026-06-23: Initial publish.
