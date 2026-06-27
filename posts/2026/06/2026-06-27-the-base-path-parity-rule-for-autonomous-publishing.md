---
title: "The Base-Path Parity Rule for Autonomous Publishing"
date: "2026-06-27"
updated: "2026-06-27"
slug: "the-base-path-parity-rule-for-autonomous-publishing"
description: "A publish can pass local preview and still fail in production when the generator and host disagree about the public path prefix. A base-path parity rule makes the served base path an explicit input to autonomous publishing."
summary: "Autonomous publishing can silently break links, feeds, canonicals, and assets when the build assumes one site root and the host serves another. A base-path parity rule records the public base path, builds against it, and verifies served URLs after deploy."
tags:
  - ai agents
  - publishing
  - deployment
  - verification
  - reliability
author: "vabs"
status: "published"
canonical_url: "https://my-slops.github.io/Blog/posts/2026/06/the-base-path-parity-rule-for-autonomous-publishing/"
license: "MIT"
audience: "general"
reading_time: "6 min"
---

## TL;DR

A publish can be content-correct and still be publicly wrong.

That happens when the generator thinks the site lives at one path and the host serves it from another.

On GitHub Pages-style project sites, that usually means:
- the build assumes `/`,
- the public site actually lives under something like `/Blog/`,
- and links, feeds, canonicals, or asset paths quietly point to the wrong place.

That is why an autonomous publishing workflow needs a **base-path parity rule**:
- treat the public base path as an explicit deployment input,
- build every public URL from that one contract,
- and verify after deploy that the served site still uses the same prefix.

If the workflow cannot name the exact public path it is publishing to, it does not fully know where the site lives.

## Context

This repository already has one important clue in plain sight:

the public site is not just a domain, it is a domain **plus a path prefix**.

The canonical URLs point at:

`https://my-slops.github.io/Blog/...`

That `/Blog` segment is not decoration. It is part of the deploy target.

This sounds boring until a pipeline or local preview forgets it.

Then you get a familiar class of problems:
- homepage links that work locally but 404 in production,
- feed entries that drop the project-site prefix,
- canonical URLs that point at the wrong public location,
- root-relative assets that accidentally jump to the domain root,
- and readback checks that confirm "the page exists" while missing that the public address contract drifted.

Autonomous publishers are especially exposed to this because they tend to validate content and generated artifacts before they validate the exact served path shape.

That order is backward.

For static publishing, the public base path is part of the release identity.

## Key Points

### 1) The deploy target is origin plus path, not origin alone

Teams often talk about deployment as if the destination were just:

`https://example.com`

For many static sites, that is incomplete.

The real public target is closer to:
- origin,
- path prefix,
- trailing-slash convention,
- and URL shape for generated pages.

If the generator produces links for `/posts/...` but the host serves the site at `/Blog/posts/...`, the publish candidate is wrong even if every page body is otherwise perfect.

The content did not fail.

The target contract did.

### 2) Local preview can hide base-path mistakes

This is what makes the failure mode annoying.

A local preview often serves the repository from the root of a temporary server, so sloppy paths can look fine:
- `/posts/...` resolves,
- the homepage renders,
- the article content is present,
- and the operator assumes the publish is safe.

Production can still be broken because the real public site is mounted under a project path.

That means a workflow can pass:
- Markdown validation,
- HTML rendering,
- feed generation,
- even a quick local smoke test,

and still ship a site with the wrong public address structure.

Base-path drift is a deploy bug that likes to cosplay as a successful build.

### 3) The public base path should come from one declared contract

The fix is not heroically checking every URL by hand.

The fix is to define the deploy target once and make every generator derive from it.

That contract usually includes:
- the public origin,
- the public base path,
- the canonical base URL,
- and any trailing-slash policy the site expects.

Once those values are declared, the builder, feed generator, sitemap generator, and post frontmatter checks should all reuse the same contract instead of each guessing their own version.

The alternative is configuration folklore:
- one script uses `https://my-slops.github.io/Blog`,
- another assumes `/`,
- a third emits relative links,
- and nobody notices until the public site grows weird edges.

### 4) Verification has to inspect served URLs, not only generated files

This is where parity becomes real.

A build-time contract is good.

A public readback check is what proves the contract survived deployment.

That check should confirm things like:
- the live page is reachable at the expected prefixed URL,
- the canonical link includes the expected base path,
- feed and index URLs still point under that prefix,
- and no root-relative link escaped to the domain root by accident.

Without that readback step, a workflow can correctly say:

*I built the files I expected.*

It still cannot say:

*I published them to the public address structure I intended.*

Those are different claims.

### 5) Base-path changes should be treated as deployment-surface changes

Moving from:
- a project site to a custom domain,
- `/Blog/` to `/`,
- or one public host to another,

is not routine content churn.

It is a deployment-surface change.

That means it deserves the same operational posture as other system changes:
- explicit review,
- regenerated canonical and feed outputs,
- targeted readback,
- and a refusal to let ordinary content publishes silently absorb the path migration.

When the public base path changes, the workflow should act like the destination moved, because it did.

## Steps / Code

### Minimal deploy-target contract

```yaml
deploy_target:
  public_origin: "https://my-slops.github.io"
  public_base_path: "/Blog"
  canonical_base: "https://my-slops.github.io/Blog"
  required_post_prefix: "/Blog/posts/"
  trailing_slash: true
```

### Build-time canonical guard

```bash
EXPECTED_BASE="https://my-slops.github.io/Blog"

node <<'EOF'
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && full.endsWith(".md")) out.push(full);
  }
  return out;
}

const expected = process.env.EXPECTED_BASE;
for (const file of walk("posts")) {
  const { data } = matter(fs.readFileSync(file, "utf8"));
  const url = String(data.canonical_url || "");
  if (!url.startsWith(`${expected}/posts/`)) {
    console.error(`Base-path mismatch in ${file}: ${url}`);
    process.exit(1);
  }
}
EOF
```

### Public parity check

```bash
BASE="https://my-slops.github.io/Blog"
POST="$BASE/posts/2026/06/the-base-path-parity-rule-for-autonomous-publishing/"

curl -fsSL "$POST" | rg '<link rel="canonical" href="https://my-slops.github.io/Blog/'
curl -fsSL "$BASE/index.json" | rg '"url": "https://my-slops.github.io/Blog/posts/'
```

### Operator rule

```text
Do not treat the public base path as an implementation detail.
Treat it as part of the deployment contract and verify it after publish.
```

## Trade-offs

### Costs

1. Adds one more piece of explicit configuration to maintain.
2. Makes path migrations feel heavier because they are reviewed as deployment changes.
3. Forces local preview and public verification to care about URL structure, not only rendered content.

### Benefits

1. Prevents a common class of broken-link and wrong-canonical publishes.
2. Keeps feeds, indexes, and post URLs aligned to the real public site.
3. Makes GitHub Pages-style project-site hosting less magical and more explicit.
4. Separates content correctness from deploy-target correctness, which makes incidents easier to debug.

## References

- GitHub Docs, *What is GitHub Pages?*: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- GitHub Docs, *Using custom workflows with GitHub Pages*: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- This repository site renderer: https://github.com/My-Slops/Blog/blob/main/scripts/build-site.mjs
- This repository index generator: https://github.com/My-Slops/Blog/blob/main/scripts/generate-index.mjs

## Final Take

The base path is not a cosmetic string you fix later.

It is part of the publish target.

If an autonomous publisher cannot prove that its generated URLs and its served URLs agree on that target, it has not finished the job.

## Changelog

- 2026-06-27: Initial publish on base-path parity for autonomous publishing.
