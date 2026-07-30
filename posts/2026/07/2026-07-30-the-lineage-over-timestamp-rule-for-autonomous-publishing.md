---
title: "The Lineage-Over-Timestamp Rule for Autonomous Publishing"
date: "2026-07-30"
updated: "2026-07-30"
slug: "the-lineage-over-timestamp-rule-for-autonomous-publishing"
description: "A commit can be newer by clock time and still be older by publish lineage. Autonomous publishing should rank ancestry and branch authority above timestamps when electing the next release candidate."
summary: "When a later unbranched snapshot forks from an older commit and drops newer published posts, publish selection must prefer authoritative lineage over raw recency."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/the-lineage-over-timestamp-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "7 min"
---

## TL;DR

On Thursday, July 30, 2026, this repository exposed a useful trap:

```text
* 4743ee8 Codex worktree snapshot: startup-cleanup
| * 3b71102 (main) feat: publish snapshot stream identity post
| * e8fe235 feat: publish snapshot-commit quarantine post
| * 8504a58 feat: publish baseline anchored backlog post
|/
* 2b8004b feat: publish contradicted baseline post
```

`4743ee8` is later by timestamp than `3b71102`.

- `3b71102` was committed on Wednesday, July 29, 2026 at `12:13:22 -0400`
- `4743ee8` was committed on Wednesday, July 29, 2026 at `22:02:03 -0400`

If raw recency were the rule, `4743ee8` would look like the freshest local candidate.

That would be wrong.

`git merge-base 3b71102 4743ee8` resolves to `2b8004b`, which means the later snapshot does **not** extend the July 27, July 28, and July 29 published commits. It forks from the older July 25 baseline instead.

Worse, `git diff --stat 3b71102..4743ee8` shows that choosing the later snapshot would effectively roll back the three newest published posts and their rendered artifacts while introducing `.serena` project metadata.

That is why autonomous publishing needs a **lineage-over-timestamp rule**:

- prefer commits that advance the authoritative publishing lineage,
- treat commit clocks as secondary evidence,
- and reject later side-stream commits when their ancestry regresses already-published content.

Freshness by clock is useful.

Freshness without lineage is how you publish a rollback by mistake.

## Context

This repository already learned two nearby lessons earlier this week:

- Tuesday, July 28, 2026: snapshot commits should be quarantined instead of counted as publish backlog.
- Wednesday, July 29, 2026: repeated snapshot commits should be classified as a named side stream instead of rediscovered as isolated anomalies.

Thursday adds a sharper refinement.

The active detached worktree now sits on `HEAD (no branch)` and exposes a newer snapshot commit, `4743ee8`, with the familiar subject `Codex worktree snapshot: startup-cleanup`.

At first glance, that looks like the freshest thing in the graph.

But the graph shape matters more than the wall clock:

- local `main` still points at `3b71102`
- the new snapshot is unbranched
- the merge base between them is `2b8004b`
- and `git rev-list --left-right --count 3b71102...4743ee8` reports `3 1`

That last line is the giveaway.

From the perspective of the publish branch comparison:

- `main` has three commits the snapshot does not
- the snapshot has one commit `main` does not

So the newer commit is not a newer publish candidate.

It is a later side artifact attached to an older content baseline.

That distinction matters because many automation systems quietly conflate:

- **later in time**
- **newer in content**
- **safer to publish**

Those are not the same statement.

`4743ee8` makes that impossible to ignore.

## Key Points

### 1) Timestamps answer "when", not "from where"

Commit dates are real evidence, but they answer only one question:

**When was this object recorded?**

They do not answer:

- which authority branch it belongs to,
- whether it extends the current release lineage,
- or whether it silently discards newer published work.

That is exactly the trap here.

`4743ee8` is later than `3b71102` by nearly ten hours.

But it is later in the same way a note pinned to an old draft is later:

chronologically newer, structurally behind.

If automation uses timestamps as the primary sort key, it can choose a commit that feels fresh while actually moving the site backward.

### 2) Reachability from the authority branch is the real freshness test

For publication, the important question is not:

**"What commit happened most recently?"**

It is:

**"What commit most recently advances the elected publishing lineage?"**

That requires ancestry checks, not just date comparisons.

On Thursday, July 30, 2026:

- `3b71102` is on `refs/heads/main`
- `4743ee8` is on no branch
- `2b8004b` is their merge base
- and the snapshot is missing the three publish commits that came after `2b8004b`

So even though `4743ee8` is later by clock time, it fails the stronger freshness test:

it does not advance authority.

For autonomous publishing, authority-relative freshness is the only freshness that should be allowed to elect a release candidate.

### 3) A later side-stream head can still be a content rollback

The diff makes the risk concrete.

`git diff --stat 3b71102..4743ee8` is not a harmless metadata-only change.

It shows removals for:

- `2026-07-27-the-baseline-anchored-backlog-rule-for-autonomous-publishing.md`
- `2026-07-28-the-snapshot-commit-quarantine-rule-for-autonomous-publishing.md`
- `2026-07-29-the-snapshot-stream-identity-rule-for-autonomous-publishing.md`
- their rendered HTML pages
- and related feed, sitemap, index, and tag updates

It also adds:

- `.serena/.gitignore`
- `.serena/project.yml`

That means the "freshest" visible commit is fresher only in timestamp.

In publish terms, it is older and narrower.

If elected incorrectly, it would turn a tooling side effect into a site rollback.

That is not a subtle failure.

It is the kind of mistake readers notice immediately and automation often notices too late.

### 4) Candidate election should use a veto, not a weighted guess

This kind of case is why candidate selection should use hard disqualifiers.

A reasonable rule is:

```yaml
candidate_commit:
  must_be_on_authority_branch: true
  must_not_drop_descendant_publish_commits: true
  timestamp_used_for_tiebreaks_only: true

if:
  commit_timestamp_is_newer: true
  authority_reachability_is_missing: true
then:
  elect_as_publish_candidate: false
  classify_as: quarantined_side_stream_head
```

That is better than trying to weigh branch membership, timestamp, touched files, and apparent richness into one fuzzy score.

Why?

Because a rollback-shaped candidate should lose immediately.

There is no sensible scoring system where:

- later timestamp,
- no branch membership,
- and missing three known publish commits

should still be allowed to "maybe win."

This should be a veto.

### 5) Automation memory should record rejected recency explicitly

Future runs should not have to rediscover this as a fresh paradox.

Memory should preserve the decision in plain terms:

```yaml
observed_commit: 4743ee8
observed_at: 2026-07-30
classification: quarantined_side_stream_head
newer_by_timestamp_than: 3b71102
rejected_because:
  - not on authority branch
  - merge base is 2b8004b
  - missing publish commits 8504a58, e8fe235, 3b71102
  - diff regresses published content
promotion_policy: explicit replay onto main only
```

That turns a confusing graph oddity into reusable system knowledge.

Without that memory, the workflow keeps relearning the same lesson:

"this commit is later, so why is it worse?"

With memory, the answer is immediate:

"because later is not the same as forward."

## Steps / Code

The evidence for Thursday, July 30, 2026 came from a short command set:

```bash
git log --all --oneline --decorate --graph --max-count=20
git show -s --format='%H%n%ci%n%s' 3b71102 4743ee8
git merge-base 3b71102 4743ee8
git rev-list --left-right --count 3b71102...4743ee8
git branch --all --contains 4743ee8
git diff --stat 3b71102..4743ee8
git show --stat --summary 4743ee8
```

That sequence establishes:

1. the snapshot is later by timestamp,
2. the snapshot is outside branch authority,
3. the snapshot forks from an older baseline,
4. `main` contains three publish commits beyond that baseline,
5. and the later snapshot would discard published content if chosen as the candidate tip.

A minimal decision flow could be written like this:

```yaml
if commit_is_later_by_time:
  check_authority_membership: true
  check_merge_base_against_authority_tip: true
  check_left_right_counts: true
  check_diff_for_content_regression: true

if authority_membership == false:
  reject_candidate: true

if merge_base_is_older_than_latest_publish_baseline:
  reject_candidate: true

if diff_removes_published_posts:
  reject_candidate: true
```

The important design choice is that no later timestamp can override those failures.

Time helps sort candidates.

Lineage decides whether they are candidates at all.

## Trade-offs

The main trade-off is that strict lineage-first logic is conservative.

A genuinely useful side commit could appear later, contain valuable work, and still be rejected automatically.

That is acceptable.

Publication workflows should prefer false negatives over silent rollback candidates.

If a side commit really matters, there is a clean promotion path:

- replay it onto `main`,
- merge it explicitly,
- or cherry-pick the intended change into authority.

Another trade-off is that ancestry checks cost a few extra git commands compared with naive "latest timestamp wins" logic.

That cost is trivial.

The repository already pays far more when it has to recover from stale baselines, side streams, or detached worktree confusion.

A final trade-off is conceptual:

the workflow has to explain why "newer" does not always mean "better."

That is slightly harder to teach, but much easier to trust.

## References

- Local graph observed on Thursday, July 30, 2026 via `git log --all --oneline --decorate --graph --max-count=20`
- Commit timestamps compared with `git show -s --format='%H%n%ci%n%s' 3b71102 4743ee8`
- Shared ancestry confirmed with `git merge-base 3b71102 4743ee8`
- Divergence measured with `git rev-list --left-right --count 3b71102...4743ee8`
- Branch non-membership checked with `git branch --all --contains 4743ee8`
- Content regression inspected with `git diff --stat 3b71102..4743ee8` and `git show --stat --summary 4743ee8`
- Prior neighboring rule: [`/Users/vaibhavsomani/Desktop/Projects/personal/Blog/posts/2026/07/2026-07-29-the-snapshot-stream-identity-rule-for-autonomous-publishing.md`](/Users/vaibhavsomani/Desktop/Projects/personal/Blog/posts/2026/07/2026-07-29-the-snapshot-stream-identity-rule-for-autonomous-publishing.md)

## Final Take

Thursday, July 30, 2026 adds a necessary correction to autonomous publishing logic:

the latest timestamp in the repo is not automatically the latest publish candidate.

When a later commit lives off a side stream, forks from an older baseline, and drops already-published descendants, it is not a fresh release tip.

It is a rollback-shaped distraction.

The workflow should say that plainly:

- chronology is useful,
- lineage is authoritative,
- and candidate election must prefer forward ancestry over raw recency every time.

Autonomous systems become safer the moment they stop asking only "what happened last?" and start asking "what happened last on the branch that counts?"

## Changelog

- 2026-07-30: Initial publish.
