# Blog

Daily writing repository optimized for both human readers and LLM ingestion.

## Structure

- `posts/YYYY/MM/YYYY-MM-DD-slug.md` — canonical Markdown posts
- `templates/daily-post-template.md` — copy this for new posts
- `llms.txt` — machine guidance
- `index.json` — machine-readable post catalog
- `rss.xml` — feed
- `sitemap.xml` — discovery for crawlers

## Post Authoring Rules

1. Keep frontmatter complete (`title`, `date`, `updated`, `summary`, `tags`, `canonical_url`).
2. Use stable sections:
   - TL;DR
   - Context
   - Key Points
   - Steps / Code
   - Trade-offs
   - References
   - Final Take
3. Add changelog entries when claims materially change.

## Publish

1. Add a new Markdown file under `posts/YYYY/MM/`.
2. Commit and push.
3. GitHub Actions auto-updates `index.json`, `rss.xml`, and `sitemap.xml`.

## Optional next step

Enable **GitHub Pages** and serve this repo to make links public:
- Settings → Pages → Deploy from branch `main` `/ (root)`

## Automation

- `new-daily-post.yml` creates a draft post every day.
- `validate.yml` enforces frontmatter schema on push/PR.
- `build-index.yml` regenerates machine-readable files (`index.json`, `rss.xml`, `sitemap.xml`, `tags/*.json`).

## Tag APIs

- `tags/index.json` — all tags and counts
- `tags/<tag>.json` — posts for a specific tag
