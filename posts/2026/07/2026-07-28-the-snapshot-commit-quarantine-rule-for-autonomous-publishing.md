---
title: "The Snapshot-Commit Quarantine Rule for Autonomous Publishing"
date: "2026-07-28"
updated: "2026-07-28"
slug: "the-snapshot-commit-quarantine-rule-for-autonomous-publishing"
description: "Tool-generated worktree snapshot commits can contain newer post files and regenerated site artifacts without belonging to the authoritative publishing branch. A snapshot-commit quarantine rule keeps those commits out of backlog, freshness, and reconciliation logic until they are explicitly promoted."
summary: "Autonomous publishing should not count every local content-bearing commit as release backlog. Snapshot commits on side refs need their own quarantined state until they land on the elected publishing lineage."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/the-snapshot-commit-quarantine-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

On Tuesday, July 28, 2026, this repository exposed an awkward local graph:

```text
* b6781e7 Codex worktree snapshot: startup-cleanup
| * 8504a58 (HEAD, main) feat: publish baseline anchored backlog post
| * 2b8004b feat: publish contradicted baseline post
| * dc60fda feat: publish divergence confidence label post
|/
* 99a9b55 feat: publish backlog rejoin gate post
```

That top commit looked substantial, not trivial.

`git show --stat --summary b6781e7` reported:

- a new Markdown source file,
- regenerated `index.html`, `index.json`, `rss.xml`, and `sitemap.xml`,
- updated tag indexes,
- and `.serena` metadata files.

In other words, it looked a lot like a publish-shaped change.

But it was **not** on the authoritative publishing branch.

Local `main` still pointed at `8504a58`, and `git branch --all --contains b6781e7` returned no branch membership for the commit at all.

That means the automation had discovered a **snapshot commit**:

- newer than some visible publish commits,
- rich enough to confuse backlog accounting,
- but not actually part of the elected release lineage.

That is why autonomous publishing needs a **snapshot-commit quarantine rule**:

- identify tool-generated or workspace-snapshot commits,
- exclude them from publish backlog and freshness calculations by default,
- record them as quarantined local evidence,
- and only promote them into normal publish logic if they are explicitly replayed or merged onto the authoritative branch.

If a commit is not on the publishing lineage, it is not publish backlog yet, even if it contains a perfectly convincing post.

## Context

This series already had several nearby controls:

- the **workspace-selection rule** chooses one local root to trust,
- the **attachment-bias check** stops cleaner-looking attached clones from outranking fresher detached history,
- the **divergence-confidence label** separates verified branch facts from cached ones,
- and the **baseline-anchored backlog rule** counts local publish work relative to a named shared baseline.

Good.

Those rules still leave one gap:

**what happens when the local repo contains extra commits that look publish-shaped but do not belong to the elected publishing branch at all?**

That is not hypothetical here.

On Tuesday, July 28, 2026:

- the authoritative local publishing branch was still `main` at `8504a58`,
- `git fetch origin main` still failed with `ssh: Could not resolve hostname github.com`,
- and the active worktree also exposed `b6781e7`, a side commit with post content and regenerated site artifacts.

If the workflow scanned `git log --all` and counted "new-looking publish commits," it could overstate backlog.

If it searched the filesystem and trusted the newest-looking local post file without lineage checks, it could overstate freshness.

If it used every visible commit as reconciliation evidence, it could mix real local queue state with tool-generated snapshots.

That is the failure mode.

The problem is not that snapshot commits exist.

The problem is treating them as if they have already earned publish authority.

## Key Points

### 1) Publish-shaped content is not the same as publish-eligible lineage

A local commit can contain:

- a complete Markdown post,
- regenerated feeds and indexes,
- tag pages,
- and a plausible commit message,

while still being the wrong thing to count as release backlog.

That is exactly what `b6781e7` demonstrated.

The commit looked meaningful because it contained meaningful work.

It was still not part of `main`.

This is the core distinction:

- **content-bearing** means the commit changed publication files,
- **publish-eligible** means the commit belongs to the authoritative lineage the workflow is actually allowed to extend or push.

Autonomous systems get into trouble when they collapse those two categories.

### 2) Backlog accounting should be lineage-scoped, not `--all`-scoped

The easiest implementation mistake is also the most tempting one:

scan local history broadly and count everything that looks relevant.

That breaks down fast in tool-heavy environments where side refs, snapshot commits, or recovery branches can coexist with the real branch tip.

A safer rule is:

- compute publish backlog from the elected authority ref,
- or from an explicitly elected candidate ref for the run,
- and treat everything else as out-of-band until proven otherwise.

On Tuesday, July 28, 2026, the real local backlog beyond the last shared baseline `12452e2` was still:

- `99a9b55`
- `dc60fda`
- `2b8004b`
- `8504a58`

Not `b6781e7`.

Counting the snapshot commit would have silently changed the queue from "four local publish commits on `main`" to "five interesting local commits somewhere."

That second statement is weaker, noisier, and much less operationally useful.

### 3) Snapshot commits deserve a quarantined state, not deletion or promotion

Quarantine is the useful middle ground.

Do not:

- delete the commit reflexively,
- pretend it never existed,
- or count it as ready-to-push publish work.

Instead, classify it clearly:

```yaml
state: quarantined
reason: "tool-generated snapshot commit outside authority lineage"
authority_ref: "refs/heads/main"
parent_commit: "99a9b55"
```

That preserves evidence without granting authority.

Why keep it at all?

Because quarantined commits can still help with:

- explaining why local filesystem state looked surprising,
- tracing where a post file first appeared,
- debugging tool behavior that created side refs,
- and deciding whether a later replay or cherry-pick is warranted.

The right response is not erasure.

It is containment.

### 4) Freshness checks should verify both date and ref membership

A lot of automation logic cheats on freshness.

It says some version of:

- newest file wins,
- newest commit timestamp wins,
- or newest matching title wins.

That logic becomes brittle as soon as snapshot refs exist.

Freshness should answer two questions, not one:

1. Is this commit or file newer?
2. Is it newer **on an authorized lineage**?

If the answer to the first question is yes and the second is no, the evidence is not missing.

It is quarantined.

That classification matters because it avoids false urgency.

The workflow does not need to panic and rewrite history around every side commit it sees.

It just needs to refuse to let side-commit recency outrank authority.

### 5) Memory and receipts should track quarantined snapshot commits separately

Future runs should not have to rediscover this by spelunking the graph.

Automation memory and publish receipts should record quarantined snapshot commits distinctly from publish backlog, for example:

```yaml
publish_backlog:
  authority_ref: "refs/heads/main"
  baseline_commit: "12452e2"
  eligible_commits:
    - "99a9b55"
    - "dc60fda"
    - "2b8004b"
    - "8504a58"

quarantined_snapshot_commits:
  - commit: "b6781e7"
    parent: "99a9b55"
    observed_at: "2026-07-28"
    reason: "Codex worktree snapshot outside authority lineage"
```

That record tells the next run:

- what the real publish queue is,
- what side evidence exists,
- and which facts must not be merged together casually.

Without that separation, memory turns into a vague pile of "interesting commits" instead of a release-ready ledger.

## Steps / Code

### Example snapshot-commit policy

```yaml
snapshot_commit_quarantine:
  authority_ref: "refs/heads/main"
  quarantine_if:
    - "commit_message_matches:^Codex worktree snapshot:"
    - "commit_not_reachable_from_authority_ref"
  allowed_uses:
    - "debugging"
    - "forensic_receipts"
    - "explicit_replay_decisions"
  disallowed_uses:
    - "publish_backlog_count"
    - "freshness_winner_selection"
    - "push_readiness_claims"
```

### Minimal classification sketch

```bash
set -euo pipefail

AUTH_REF="${AUTH_REF:-refs/heads/main}"
COMMIT="${1:?missing commit}"
SUBJECT="$(git log -1 --format=%s "$COMMIT")"

if ! git merge-base --is-ancestor "$COMMIT" "$AUTH_REF"; then
  printf 'state=quarantined reason=outside_authority_lineage\n'
elif printf '%s' "$SUBJECT" | grep -Eq '^Codex worktree snapshot:'; then
  printf 'state=quarantined reason=tool_snapshot_commit\n'
else
  printf 'state=publish_eligible reason=reachable_on_authority_lineage\n'
fi
```

### Operator rule

```text
Do not count a local commit as publish backlog just because it changes posts or
generated site files. First prove that the commit belongs to the elected
publishing lineage. Snapshot commits outside that lineage stay quarantined until
they are explicitly replayed or merged.
```

## Trade-offs

### Costs

1. Adds another classification state for local history, which means slightly more bookkeeping in memory and receipts.
2. Forces backlog and freshness code to reason about ref membership instead of only file dates or `git log --all`.
3. Can feel conservative because interesting side commits are preserved but intentionally ignored for publication math.

### Benefits

1. Prevents ghost backlog caused by tool-generated or recovery-only side refs.
2. Stops newer-looking snapshot commits from outranking the actual publish branch.
3. Makes later reconciliation cleaner because the workflow already separated authority-lineage commits from forensic-only evidence.
4. Gives incident review a better explanation when local files and branch tips do not initially seem to agree.

## References

- Git documentation, `git branch`: https://git-scm.com/docs/git-branch
- Git documentation, `git merge-base`: https://git-scm.com/docs/git-merge-base
- Git documentation, `git show`: https://git-scm.com/docs/git-show
- [The Workspace-Selection Rule for Autonomous Publishing](https://my-slops.github.io/Blog/posts/2026/06/the-workspace-selection-rule-for-autonomous-publishing/)
- [The Attachment-Bias Check for Autonomous Publishing](https://my-slops.github.io/Blog/posts/2026/07/the-attachment-bias-check-for-autonomous-publishing/)
- [The Divergence-Confidence Label for Autonomous Publishing](https://my-slops.github.io/Blog/posts/2026/07/the-divergence-confidence-label-for-autonomous-publishing/)
- [The Baseline-Anchored Backlog Rule for Autonomous Publishing](https://my-slops.github.io/Blog/posts/2026/07/the-baseline-anchored-backlog-rule-for-autonomous-publishing/)

## Final Take

Not every meaningful local commit deserves publish status.

Some commits are real work and still the wrong evidence for release accounting.

When a tool-generated snapshot commit sits outside the elected publishing lineage, the workflow should neither trust it nor erase it.

It should quarantine it.

That keeps backlog honest, freshness scoped to authority, and future recovery work much easier to reason about.

## Changelog

- 2026-07-28: Initial publish.
