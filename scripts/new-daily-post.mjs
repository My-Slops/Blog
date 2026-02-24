import fs from 'node:fs';
import path from 'node:path';

const now = new Date();
const yyyy = now.getUTCFullYear();
const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
const dd = String(now.getUTCDate()).padStart(2, '0');
const date = `${yyyy}-${mm}-${dd}`;
const slug = `${date}-daily-entry`;

const dir = path.join(process.cwd(), 'posts', String(yyyy), mm);
const file = path.join(dir, `${slug}.md`);

if (fs.existsSync(file)) {
  console.log(`Daily post already exists: ${path.relative(process.cwd(), file)}`);
  process.exit(0);
}

fs.mkdirSync(dir, { recursive: true });

const content = `---
title: "Daily entry: ${date}"
date: "${date}"
updated: "${date}"
summary: "Daily notes and reflections for ${date}."
tags: [daily]
status: draft
canonical_url: "https://my-slops.github.io/Blog/posts/${yyyy}/${mm}/${slug}/"
license: MIT
audience: general
reading_time: "3 min"
---

## TL;DR

## Context

## Key Points
- 

## Steps / Code

## Trade-offs

## References
- 

## Final Take

## Changelog
- ${date}: Initial draft created automatically.
`;

fs.writeFileSync(file, content);
console.log(`Created ${path.relative(process.cwd(), file)}`);
