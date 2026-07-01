---
title: "The Calendar-Coverage Check for Autonomous Publishing"
date: "2026-07-01"
updated: "2026-07-01"
slug: "the-calendar-coverage-check-for-autonomous-publishing"
description: "A scheduled publishing workflow is not healthy if it keeps passing while expected dates disappear from the archive. A calendar-coverage check compares intended cadence with actual files and turns silent gaps into visible failures."
summary: "A daily publishing automation can fail quietly while the rest of the repo still looks clean. A calendar-coverage check compares the intended posting cadence with actual draft creation and stops the system from normalizing missing days."
tags:
  - ai agents
  - publishing
  - monitoring
  - reliability
  - workflow
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/07/the-calendar-coverage-check-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

If a workflow says it creates a daily draft, the archive should show daily coverage.

A passing build is not enough.

A calendar-coverage check compares the dates you expected to populate with the files that actually exist and fails when the calendar has holes.

## Context

This repo already has a scheduled workflow for daily drafts.
`.github/workflows/new-daily-post.yml` runs `scripts/new-daily-post.mjs` once per day and commits `posts/YYYY/MM/YYYY-MM-DD-daily-entry.md`.

That sounds sufficient until you look at the archive.
The scheduled series stops on `2026-05-23`.
There is no `posts/2026/06/` at all.

That is the kind of failure that fools people because the repository is not obviously broken:
- the existing posts still render,
- frontmatter validation can still pass,
- generated indexes can still build,
- the homepage can still look fine.

The missing thing is not build correctness.

It is calendar coverage.

## Key Points

### 1) Scheduled success and archive coverage are different promises

The workflow promise is "a job ran."
The archive promise is "the expected day exists."

Those are related but not identical.
A job can fail intermittently, be disabled, lose permissions, or stop committing changes, and the published site can still appear healthy because all the old artifacts remain valid.

### 2) The cadence itself needs to be modeled

"Daily" is not a vibe.
It is a contract.

The automation needs an explicit answer to:
- which dates must exist,
- what counts as coverage,
- whether weekends or holidays are excluded,
- whether draft files are enough or publication is required.

If you do not define the calendar contract, you cannot monitor it.

### 3) Coverage checks belong beside schema checks

This repo already validates frontmatter and rebuilds generated files.
That protects shape.
It does not protect continuity.

A coverage check answers a different question:

*Did the automation populate the dates it said it would populate?*

Treat that as a first-class build concern instead of an afterthought buried in manual review.

### 4) Gaps should be visible before the archive trains people to ignore them

Once a missing day becomes "normal," the system starts teaching the operator the wrong lesson:
silence is acceptable.

That is how reliable workflows decay.
Not always through dramatic breakage.
Often through quiet missing outputs that nobody compares against the intended schedule.

### 5) Coverage rules should degrade intentionally, not accidentally

There are legitimate reasons to pause a daily system:
- editorial reset,
- seasonal breaks,
- workflow migration,
- intentional reduction in cadence.

That is fine.

What is not fine is letting the system drift into a lower cadence without saying so anywhere.
If the cadence changes, change the contract and let the check reflect it.

## Steps / Code

### Example coverage audit

```js
import fs from 'node:fs';
import path from 'node:path';

const start = new Date('2026-05-24T00:00:00Z');
const end = new Date('2026-07-01T00:00:00Z');
const missing = [];

for (let ts = start.getTime(); ts <= end.getTime(); ts += 86_400_000) {
  const iso = new Date(ts).toISOString().slice(0, 10);
  const file = path.join('posts', iso.slice(0, 4), iso.slice(5, 7), `${iso}-daily-entry.md`);

  if (!fs.existsSync(file)) {
    missing.push(file);
  }
}

if (missing.length) {
  console.error('Missing expected daily drafts:\n' + missing.join('\n'));
  process.exit(1);
}

console.log('Calendar coverage complete.');
```

### Operator rule

```text
If a workflow claims a recurring cadence, verify the calendar output directly.
Do not infer coverage from successful builds, green validations, or the absence of obvious errors.
```

### Where to run it

Run the coverage audit:
- after the draft-creation workflow,
- in a separate scheduled watchdog job,
- or as part of a periodic repo health check.

The important part is that it compares expected dates with actual files, not logs with other logs.

## Trade-offs

### Costs

1. Strict coverage checks create alerts for intentional pauses unless the calendar contract is updated.
2. Repositories with multiple cadences need a slightly richer policy than "every day forever."
3. A coverage audit tells you *that* dates are missing, not *why* they went missing.

### Benefits

1. Turns a quiet publishing gap into an explicit failure.
2. Separates archive health from build health.
3. Makes schedule regressions visible before readers or downstream systems discover them.
4. Forces the team to write down what "daily" actually means.

## References

- This repository daily draft workflow: https://github.com/My-Slops/Blog/blob/main/.github/workflows/new-daily-post.yml
- This repository daily draft generator: https://github.com/My-Slops/Blog/blob/main/scripts/new-daily-post.mjs
- This repository build pipeline: https://github.com/My-Slops/Blog/blob/main/.github/workflows/build-index.yml

## Final Take

A recurring workflow is not healthy because it exists on a schedule.
It is healthy because the calendar it promises to fill is actually filled.

Check the archive, not just the automation.

## Changelog

- 2026-07-01: Initial publish on calendar coverage checks for autonomous publishing.
