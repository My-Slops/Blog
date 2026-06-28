---
title: "The Stable-Slug Rule for Autonomous Publishing"
date: "2026-06-28"
updated: "2026-06-28"
created_at: "2026-06-28T10:00:00-04:00"
published_at: "2026-06-28T10:00:00-04:00"
scheduled_at: "2026-06-28T10:00:00-04:00"
slug: "the-stable-slug-rule-for-autonomous-publishing"
description: "An autonomous publisher should not quietly rewrite a post URL after review or release. A stable-slug rule freezes the path early, treats later headline polish as separate from URL identity, and requires an explicit redirect plan for any post-launch move."
summary: "In a static publishing pipeline, a slug is not decoration. It drives the page path, canonical URL, feed GUID, sitemap entry, and tag indexes. Freeze it early, and treat later slug changes as a real state transition."
tags:
  - ai agents
  - publishing
  - reliability
  - workflow
  - blogging
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-stable-slug-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

Titles can change late.

Slugs usually should not.

In a static publishing system like this one, the slug is not just a tidy filename detail. It drives public state:
- the rendered page directory,
- the canonical URL,
- the homepage link,
- the feed GUID,
- the sitemap entry,
- and the tag indexes.

That is why an autonomous publisher needs a **stable-slug rule**:
- pick the slug early enough to review it,
- freeze it before build and publish receipts,
- allow late title edits without path churn,
- and require an explicit redirect or alias plan if the slug must change after release.

If an agent quietly rewrites the slug because it found a "better headline," it did not polish the post.

It moved the address.

## Context

This repository makes the coupling pretty obvious once you look at the build scripts.

`scripts/build-site.mjs` renders each published Markdown post into an output directory based on `data.slug` when present. `scripts/generate-index.mjs` then uses that same slug-derived URL for:
- `index.json`,
- `rss.xml`,
- `sitemap.xml`,
- and the per-tag JSON files.

That means a late slug edit is not a metadata tweak.

It is a multi-surface publish change.

The annoying part is that agents love to keep optimizing titles late in the process. Sometimes that is good. A sharper title can make a post clearer.

But title polish and URL identity are not the same job.

If those two ideas stay fused, the workflow invites a dumb failure mode:
- draft is reviewed,
- receipt is prepared,
- generated files look right,
- then the agent rewrites the slug to match a fresher headline,
- and the public path moves underneath everything that was just verified.

That is not sophistication. It is sloppy change classification.

## Key Points

### 1) A title is copy. A slug is infrastructure.

Writers understandably treat slugs as extensions of the title.

Publishing systems cannot afford that luxury.

A title exists to be read and revised. A slug exists to anchor a durable path.

Once the slug participates in:
- HTML output paths,
- canonical links,
- feed entries,
- sitemap records,
- bookmarks,
- and cross-post references,

it has crossed from editorial polish into release state.

That is the mental shift many AI-heavy workflows still miss.

### 2) Late slug churn breaks more than the page path

The obvious effect is a new URL.

The less obvious effects are what make this worth guarding:
- the feed may emit a new GUID,
- the sitemap may point at a new location,
- tag pages may link to a different path,
- internal references can drift,
- and any external share, bookmark, or read-later queue may now point at the old page.

In this repo specifically, the generated artifacts are derived from the post URL, so the blast radius is larger than the Markdown diff suggests.

That is why "it is only frontmatter" is the wrong instinct here.

### 3) The workflow should freeze slug identity before the publish becomes real

There is a practical line after which slug edits should stop being casual.

For most autonomous publishing flows, that line is before:
- the final build,
- the expected-diff check,
- the publish receipt,
- or any human review that references the future public URL.

Before that point, change it if you must.

After that point, changing the slug should require the workflow to escalate from "content polish" to "URL move."

That can still be fully automated. It just should not be invisible.

### 4) Title polish should stay allowed after slug freeze

This is the part teams often get backwards.

The answer is not "never edit anything late."

The answer is to separate the edit types:
- title changes can remain flexible,
- summary changes can remain flexible,
- body cleanup can remain flexible within normal review bounds,
- slug changes become restricted once the path is frozen.

That gives editors room to improve the post without teaching the agent that every wording tweak justifies a public address rewrite.

If you do not split those permissions, the agent will eventually optimize the wrong thing because the workflow failed to tell it what actually matters.

### 5) A post-launch slug change is a migration, not a cleanup

Sometimes the slug genuinely needs to change.

Maybe the original title was vague. Maybe you standardized naming. Maybe the post moved into a broader series.

Fine.

But once the page is public, that is no longer ordinary editing. It is a URL migration.

A real migration needs explicit handling:
- choose the new canonical destination,
- keep the old URL serving a redirect or at least an alias page,
- update receipts and indexes,
- and review the move as a public-state change.

If the platform cannot do strong redirects cleanly, that is even more reason to avoid casual slug churn.

## Steps / Code

### Minimal slug-freeze policy

```yaml
post_identity:
  source_file: "posts/2026/06/2026-06-28-the-stable-slug-rule-for-autonomous-publishing.md"
  slug: "the-stable-slug-rule-for-autonomous-publishing"
  canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-stable-slug-rule-for-autonomous-publishing/"
  slug_status: "frozen"
  title_status: "editable"
```

### Pre-publish check

```bash
POST_FILE="posts/2026/06/2026-06-28-the-stable-slug-rule-for-autonomous-publishing.md"
EXPECTED_SLUG="the-stable-slug-rule-for-autonomous-publishing"

ACTUAL_SLUG="$(awk -F': ' '/^slug: / {gsub(/"/, "", $2); print $2}' "$POST_FILE")"

if [ "$ACTUAL_SLUG" != "$EXPECTED_SLUG" ]; then
  echo "Slug changed after freeze; stop publish"
  echo "expected=$EXPECTED_SLUG actual=$ACTUAL_SLUG"
  exit 1
fi
```

### If a slug move is approved

```yaml
redirect_plan:
  old_url: "/Blog/posts/2026/06/the-old-slug/"
  new_url: "/Blog/posts/2026/06/the-stable-slug-rule-for-autonomous-publishing/"
  change_type: "url-migration"
  review_required: true
```

### Operator rule

```text
Freeze the slug before final build. If it changes after that point,
treat the change as a URL migration, not as ordinary editorial polish.
```

## Trade-offs

### Costs

1. Slightly reduces late-stage freedom to rewrite slugs whenever a better headline appears.
2. Forces the workflow to distinguish title edits from URL identity edits.
3. Makes approved slug moves feel heavier because they now need redirect or alias handling.

### Benefits

1. Keeps publish receipts, feeds, sitemaps, and internal indexes aligned to one stable public path.
2. Prevents AI "headline improvement" from silently becoming link rot.
3. Gives humans a cleaner review story: copy changed, or URL moved. Pick one.
4. Makes post-launch edits safer because not every refinement rewrites the public address.

## References

- This repository site renderer: https://github.com/My-Slops/Blog/blob/main/scripts/build-site.mjs
- This repository index generator: https://github.com/My-Slops/Blog/blob/main/scripts/generate-index.mjs
- GitHub Docs, *What is GitHub Pages?*: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Google Search Central, *How to specify a canonical URL with rel="canonical" and other methods*: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google Search Central, *Redirects and Google Search*: https://developers.google.com/search/docs/crawling-indexing/301-redirects

## Final Take

If an agent changes the slug late, it did not merely improve the wording.

It changed where the internet thinks the post lives.

That deserves stricter handling than a headline tweak.

Freeze the slug. Keep titles flexible. Treat URL moves like real release events.

## Recovery Notes

- Scheduled slot: `2026-06-28T10:00:00-04:00` (`America/Montreal`).
- Actual replay time: `2026-10-02T14:07:47-04:00` (`America/Montreal`).
- Restored from the original validated unpublished Markdown retained in the scheduled session.

## Changelog

- 2026-06-28: Initial publication for recovered scheduled slot `2026-06-28T10:00:00-04:00`.
