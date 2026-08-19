---
title: "The Same-Tree Dedup Rule for Autonomous Publishing"
date: "2026-08-07"
updated: "2026-08-18"
slug: "the-same-tree-dedup-rule-for-autonomous-publishing"
description: "Different automation events can produce the same publishable content. Deduplicate candidates by their reader-visible output before treating them as independent editorial changes."
summary: "A new event is not necessarily new content. The same-tree dedup rule groups equivalent candidates before ranking or publishing them, reducing duplicate releases and noisy review."
tags:
  - ai agents
  - publishing
  - workflow
  - reliability
  - git
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/08/the-same-tree-dedup-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "5 min"
---

## TL;DR

Automation can create multiple candidates that look different to the system but identical to readers.

The same-tree dedup rule says to group candidates by their publishable content before ranking them. If two candidates render the same pages, they are one editorial choice with different operational history—not two new things to publish.

## Context

Publish pipelines often create duplicates innocently. A retry may rebuild the same site. A backup process may produce another copy. Two workers can transform the same source into equivalent output. Version identifiers, timestamps, and provenance may differ even though the actual article text and public pages do not.

If a workflow treats every identifier as a new candidate, it wastes review time and can even publish the same editorial result twice. More subtly, it makes operational churn look like creative momentum.

Readers do not care that two jobs ran. They care whether something new appeared on the publish surface.

## Key Points

### 1) Identity has layers

Operational identity answers where an artifact came from and when it was made. Editorial identity answers what readers will receive. Both matter, but they serve different purposes.

For release selection, editorial identity comes first. Provenance helps choose between equivalent copies; it does not create new content by itself.

### 2) Compare the publish surface

Deduplication should focus on the material that will ship: Markdown content, rendered pages, feeds, images, and declared metadata. Internal logs, cache keys, tool configuration, and timestamps should not split an otherwise identical editorial candidate into separate releases.

### 3) Preserve provenance inside each duplicate group

When two candidates are equivalent, keep their origin records. One may have a cleaner verification history, a more trustworthy source, or a later build using a fixed toolchain. That evidence can help select the representative without pretending the group contains multiple posts.

### 4) Deduplication simplifies review

A reviewer should see one question: “Is this publishable content correct?” They should not have to make the same editorial judgment repeatedly because automation gave equivalent results different labels.

## Steps / Code

Before publication, organize candidates into groups:

- compare the reader-visible files and declared metadata;
- group candidates with equivalent output;
- retain source and verification notes within each group;
- select the best-verified representative; and
- publish the group once.

If two outputs differ only in generated timestamps or internal operational files, they belong in the same group. If a reader-facing page, feed item, title, or asset differs, they deserve separate review.

### A practical failure mode

Two publishing workers receive the same approved article after a transient outage. One rebuilds the site immediately; the other retries ten minutes later. Their operational records differ: different job IDs, timestamps, environments, and artifact names. Their public pages, feed entry, and article body are identical.

Without deduplication, the release queue now appears to contain two changes. A reviewer may approve both. A notification system may announce both. A later agent may spend time explaining why the site “changed” twice. Nothing reader-visible was gained; only operational noise was promoted into the editorial story.

Grouping equivalent output changes the question. Instead of choosing between two supposedly new releases, the team selects the best-attested representative of one release. The other record remains useful as proof that a retry occurred and as evidence about system reliability.

### A decision boundary for agents

An agent should create a separate editorial candidate only when the declared publish surface differs in meaning. Differences in job history, internal metadata, creation time, or storage location create another provenance record, not another post.

Within a duplicate group, prefer the candidate with the clearest review and verification trail. If neither record can prove its source, hold the group rather than selecting by timestamp. This keeps deduplication from becoming a way to hide uncertainty: it reduces repeated editorial work while preserving the evidence needed to decide which equivalent artifact is trustworthy.

### How to preserve useful differences

Deduplication should never flatten away the details that matter for reliability. Keep a record of every producer, time of creation, validation result, and any warnings that accompanied an equivalent artifact. The group represents one editorial result; its members still tell the story of how the system reached that result.

That distinction helps with future improvement. If the same content appeared from two workers but one used an outdated renderer, the team can fix the renderer without treating the output as two posts. If a retry produced the cleanest verification evidence, choose it as the representative while retaining the original run as provenance.

The principle is simple: combine candidates for editorial review, not for operational amnesia. Readers need one release. Maintainers still need to know how many times and by which routes the pipeline produced it.

### A question worth asking in review

Ask reviewers to judge the output group once, then ask operations to choose the best-attested representative. This two-part review prevents operational differences from consuming editorial attention while still ensuring that the selected artifact has a clear verification story. It is a small change in sequencing with a large reduction in duplicate decisions.

### The editorial benefit

Readers experience a release as content, not as a count of pipeline events. Deduplication keeps that experience coherent: one article, one announcement, one canonical page, and one review decision. The system may retain many successful operational records behind the scenes, but it does not ask the audience to care about them.

## Trade-offs

Surface-level comparison requires a clear definition of what is public. That definition must be maintained as the site changes.

In return, the workflow gains a much cleaner signal. Retries and copies stop inflating the apparent backlog, while provenance remains available for audits and incident response.

## References

- This repository post, *The Candidate Identity Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-candidate-identity-rule-for-autonomous-publishing/
- This repository post, *The Candidate Seal Rule for Autonomous Publishing*: https://my-slops.github.io/Blog/posts/2026/06/the-candidate-seal-rule-for-autonomous-publishing/

## Final Take

Different histories can lead to the same public result.

Treat equivalent output as one editorial candidate, retain the provenance that explains its copies, and publish the content once. That keeps automation activity from masquerading as new writing.

## Changelog

- 2026-08-07: Initial publish.
- 2026-08-18: Rewritten as evergreen publishing guidance.
