---
title: "The Draft-Only Source-Advance Rule for Autonomous Publishing"
date: "2026-08-16"
updated: "2026-08-18"
slug: "the-draft-only-source-advance-rule-for-autonomous-publishing"
description: "The authoritative source can move because a draft was created even when the public site is unchanged. Keep source freshness and reader-visible freshness as separate signals."
summary: "Draft creation changes the authoring baseline, not necessarily the public site. The draft-only source-advance rule preserves both facts without treating an unpublished placeholder as a release."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/the-draft-only-source-advance-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

## TL;DR

An authoritative source can advance without the public blog advancing.

When a scheduled or collaborative process creates a draft, the source of editorial truth has changed: future authors need to see it. But readers have not received a new publication. The draft-only source-advance rule keeps those facts separate.

## Context

Teams often use one vague phrase—“the site is current”—to describe several different layers: source files, rendered pages, feeds, and production deployment. That works until a draft is added.

A draft matters to writers because it affects planning and may later become public. It does not deserve to appear in public indexes or be reported as fresh reader-visible content before it has been reviewed and published.

Conflating these layers creates two kinds of mistakes. A source-focused workflow may tell readers something new exists when it does not. A public-surface-focused workflow may ignore a draft that the next author needs to avoid duplicating.

## Key Points

### 1) Source truth and public truth serve different people

Authors, editors, and automation need the newest source state. Readers need only the approved public state. A good publishing workflow serves both audiences without pretending their baselines are identical.

### 2) Drafts should be visible to the authoring path

A new draft can reserve a date, name a topic, supply references, or express an unfinished decision. Authoring tools should absorb it or consciously account for it before creating related work.

### 3) Drafts should not inflate public freshness

Unless a workflow explicitly publishes drafts, a draft-only source advance should not update public feeds, announce a release, or count as new content. That is a boundary worth preserving.

### 4) Receipts should say which layer moved

Replace vague status messages with precise ones: “source advanced with a draft; public output unchanged” or “public output advanced with approved post.” The wording helps the next run choose the right baseline immediately.

## Steps / Code

Track two lightweight states:

- **Current source baseline:** all approved and draft material available to authors.
- **Current public baseline:** the approved reader-visible output.

When a draft arrives, advance the source baseline, leave the public baseline unchanged, and make the difference explicit in the run record. When the draft is later published, both layers may advance together.

### A practical failure mode

A daily planning job adds a blank but correctly dated draft to the shared source. The next agent sees that the source baseline moved and updates the public feed as if a new article had been published. Readers click through to an unfinished placeholder, while the editorial team has to explain why an internal planning artifact became public news.

The opposite mistake is quieter. Another agent ignores the draft because the live site did not change, then writes a second planned entry for the same date. Both failures come from asking one baseline to answer two questions: what authors need to know, and what readers may see.

The two-layer model resolves the tension. The draft is real enough to update authoring context, but not approved enough to update public output. Both statements can be true without contradiction.

### A decision boundary for agents

When source state changes, classify it by publication status before taking downstream action:

- **Draft-only:** refresh authoring context; do not alter public output.
- **Approved but not deployed:** prepare and verify the public release path.
- **Publicly deployed:** update the reader-facing baseline and any notifications.
- **Unclear status:** keep the content out of public indexes until a human or policy resolves it.

This sequence also improves privacy and trust. It ensures that working notes, scheduled placeholders, and editorial experiments remain available to the team without accidentally crossing the publication boundary.

### How to make status visible

Use explicit status in both source files and generated indexes. A reader-facing build should exclude drafts by default, while authoring views should make them easy to find. The same status should travel through reviews, handoffs, and automation memory so a placeholder does not become publishable simply because another tool failed to understand its role.

This is also a useful editorial habit. Marking something as draft tells collaborators what kind of care it needs: development, review, scheduling, or publication. It reduces the pressure to make every new file look finished and gives automation a durable signal for choosing the right output surface.

When the status changes, treat that transition as a deliberate event. The content may need a final read, a build, metadata checks, and a public readback. Draft creation is source progress; promotion is a separate promise to readers.

### A question worth asking in review

Ask, “Has this item crossed the boundary from authoring context to reader-visible promise?” A draft has not, even when it is valuable source material. The question makes status the deciding evidence and prevents a file's mere existence from triggering public output or a release announcement.

### The editorial benefit

Respecting draft status gives unfinished ideas room to mature. Writers can see emerging work, coordinate around it, and revise it without accidentally promising it to readers. The public surface stays trustworthy precisely because source progress is allowed to remain private until it is ready.

It also lets automation support planning without assuming it has the authority to publish.

## Trade-offs

Two baselines require slightly more bookkeeping than a single “latest version” label. They also require the build and index process to respect draft status consistently.

The reward is clarity. Writers stay aware of current work, readers see only what has earned publication, and automation does not confuse planning activity with a live release.

## References

- This repository post, *The Remote-Draft-Tail Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/08/the-remote-draft-tail-rule-for-autonomous-publishing/
- This repository post, *The Promotion Manifest Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-promotion-manifest-rule-for-autonomous-publishing/

## Final Take

Drafts belong in the source baseline. Published work belongs in the public baseline.

Keeping that separation is not bureaucracy; it is how a publishing system stays honest with both its writers and its readers.

## Changelog

- 2026-08-16: Initial publish.
- 2026-08-18: Rewritten as evergreen publishing guidance.
