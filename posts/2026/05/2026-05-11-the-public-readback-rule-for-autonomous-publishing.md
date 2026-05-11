---
title: "The Public-Readback Rule for Autonomous Publishing"
date: "2026-05-11"
updated: "2026-05-11"
slug: "the-public-readback-rule-for-autonomous-publishing"
description: "A publishing agent should not call a post shipped until it reads the public URL and confirms that the served page matches the intended source and final branch state."
summary: "Autonomous publishing is still incomplete after the final commit lands. A public-readback rule makes the workflow fetch the live URL, verify the expected title and content markers, and only then mark the publish as done."
tags:
  - ai agents
  - publishing
  - verification
  - reliability
  - trust
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/2026-05-11-the-public-readback-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

A publish is not finished when the source commit lands.

It is not even finished when the downstream build commit lands.

It is finished when the public page that readers can actually load matches the post you intended to ship.

That is the **public-readback rule**:
- wait for the publish pipeline to settle,
- fetch the public URL,
- confirm the served page contains the expected title, canonical URL, and a content marker from the intended post,
- escalate if the live page still does not match within a bounded window.

If you never re-read the public page, you verified the wrong object.

## Context

Autonomous publishing pipelines often stop one step too early.

The workflow writes the Markdown source, regenerates derived files, pushes a commit, maybe even waits for a follow-on automation commit, and then declares success.

That sounds responsible. It still misses the thing readers care about: the public page.

In GitHub Pages-style systems, there are at least three distinct states:
- the source state in the repository,
- the generated state after build automation,
- the served state at the public URL.

Those states are usually aligned. "Usually" is not good enough for an agent that is allowed to publish.

The served page can lag behind because:
- deployment has not completed yet,
- the wrong branch tip was built,
- a stale artifact was promoted,
- the expected URL was not updated,
- or the public page resolves but still serves older content.

None of those failures are caught by staring only at git history.

## Key Points

### 1) Repository correctness and public correctness are different checks

Teams often blur these together because the happy path makes them look identical.

If the repo contains the right post and generated files, people assume the site must now be right too.

That assumption is comfortable and sloppy.

The repository is the input and audit surface. The public URL is the outcome surface. A trustworthy publish flow should verify both.

### 2) The public URL is the real contract with readers

Readers do not inspect your branch tip. They load a page.

So the final verification object should be something like:
- `https://.../posts/YYYY/MM/slug/`
- expected title,
- expected canonical URL,
- expected summary or phrase unique to the new post.

That is the object the workflow is actually promising to update.

### 3) Readback should validate identity, not just availability

A `200 OK` is not enough.

A live page can return successfully while still being the wrong page, an older page, or a partially updated page.

The safer check validates a compact identity set:
- HTTP success,
- exact or near-exact title match,
- canonical URL match,
- one or two unique content markers from the intended post.

This keeps the verification strict enough to catch stale publishes without turning it into a brittle full-document diff.

### 4) Public verification needs a bounded waiting window

Live systems are not instantaneous.

The right posture is not "fetch once and panic." It is:
- wait for downstream automation to finish,
- poll the public URL for a short bounded window,
- record when the expected content first appears,
- escalate if it never does.

That distinction matters because propagation delay is normal; silent mismatch is not.

### 5) Publish receipts should record the readback result

If the workflow already emits a publish receipt, the readback result belongs there.

Add fields like:
- `public_url_checked`,
- `public_readback_at`,
- `observed_title`,
- `observed_canonical_url`,
- `matched_expected_content`.

That turns "I think the page updated" into an artifact someone else can review later without replaying the entire incident from logs.

## Steps / Code

### Minimal public readback loop

```bash
PUBLIC_URL="https://my-slops.github.io/Blog/posts/2026/05/the-public-readback-rule-for-autonomous-publishing/"
EXPECTED_TITLE="The Public-Readback Rule for Autonomous Publishing"
EXPECTED_CANONICAL="$PUBLIC_URL"
EXPECTED_MARKER="If you never re-read the public page, you verified the wrong object."

for attempt in 1 2 3 4 5 6; do
  html="$(curl -fsSL "$PUBLIC_URL")" || true

  if printf '%s' "$html" | grep -Fq "$EXPECTED_TITLE" &&
     printf '%s' "$html" | grep -Fq "$EXPECTED_CANONICAL" &&
     printf '%s' "$html" | grep -Fq "$EXPECTED_MARKER"; then
    echo "Public readback matched on attempt $attempt"
    exit 0
  fi

  sleep 10
done

echo "Public readback did not match expected content"
exit 1
```

### Receipt fields worth keeping

```yaml
publish_receipt:
  source_post: "posts/2026/05/2026-05-11-the-public-readback-rule-for-autonomous-publishing.md"
  final_branch_tip: "abc1234"
  public_url: "https://my-slops.github.io/Blog/posts/2026/05/the-public-readback-rule-for-autonomous-publishing/"
  public_readback_at: "2026-05-11T14:12:19Z"
  observed_title: "The Public-Readback Rule for Autonomous Publishing"
  observed_canonical_url: "https://my-slops.github.io/Blog/posts/2026/05/the-public-readback-rule-for-autonomous-publishing/"
  matched_expected_content: true
```

### Operator rule

```text
Do not mark an autonomous publish complete until the public URL serves the intended page.
```

## Trade-offs

### Costs

1. Adds one more post-publish check and a bit more waiting.
2. Requires choosing stable content markers that are specific enough to prove identity.
3. Can surface transient deployment lag that humans used to ignore.

### Benefits

1. Verifies the outcome readers receive, not just the repo state operators prefer to inspect.
2. Catches stale deploys, wrong URLs, and lagging public pages that git-only checks miss.
3. Gives receipts a final outcome field that is easy to audit later.
4. Forces publishing agents to distinguish "pushed" from "publicly visible."

## References

- GitHub Docs, *Using custom workflows with GitHub Pages*: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Docs, *Viewing deployment history*: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/view-deployment-history
- This repository build workflow: https://github.com/My-Slops/Blog/blob/main/.github/workflows/build-index.yml

## Final Take

The branch tip is not the audience.

If the public page is the thing readers consume, then the public page is the thing the workflow has to verify before claiming success.

That extra readback step is not paranoia. It is finally checking the artifact that mattered all along.

## Changelog

- 2026-05-11: Initial publish on public readback verification for autonomous publishing.
