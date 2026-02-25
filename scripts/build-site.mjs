import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const root = process.cwd();
const postsDir = path.join(root, 'posts');
const siteBase = 'https://my-slops.github.io/Blog';

marked.setOptions({ gfm: true, breaks: false });

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && p.endsWith('.md')) out.push(p);
  }
  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function getSlug(relPath, data) {
  if (data.slug) return String(data.slug);
  return path.basename(relPath, '.md');
}

function getPostUrl(relPath, data) {
  const dirRel = path.dirname(relPath).replaceAll(path.sep, '/');
  const slug = getSlug(relPath, data);
  return `${siteBase}/${dirRel}/${slug}/`;
}

function postTemplate({ title, summary, date, tags, bodyHtml, canonicalUrl }) {
  const tagHtml = Array.isArray(tags) && tags.length
    ? `<ul class="tags">${tags.map((t) => `<li>${escapeHtml(String(t))}</li>`).join('')}</ul>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} | Blog</title>
    <meta name="description" content="${escapeHtml(summary || '')}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl || '')}" />
    <style>
      :root { color-scheme: light dark; }
      body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; line-height: 1.7; max-width: 760px; margin: 40px auto; padding: 0 16px; }
      a { color: #0a58ca; text-decoration: none; }
      a:hover { text-decoration: underline; }
      .meta { color: #666; font-size: 0.95rem; margin-bottom: 1rem; }
      .tags { display: flex; gap: 0.5rem; list-style: none; padding: 0; margin: 0.75rem 0 1.25rem; flex-wrap: wrap; }
      .tags li { background: #eef2ff; color: #3730a3; border-radius: 999px; padding: 0.2rem 0.6rem; font-size: 0.8rem; }
      article h1, article h2, article h3 { line-height: 1.3; }
      article pre { overflow-x: auto; background: #111827; color: #f9fafb; padding: 0.9rem; border-radius: 8px; }
      article code { font-family: ui-monospace,SFMono-Regular,Menlo,monospace; }
      article blockquote { border-left: 4px solid #d1d5db; margin: 1rem 0; padding: 0.2rem 0.9rem; color: #4b5563; }
      hr { border: 0; border-top: 1px solid #e5e7eb; margin: 2rem 0; }
    </style>
  </head>
  <body>
    <p><a href="${siteBase}/">← Home</a></p>
    <article>
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">${formatDate(date)}</p>
      ${tagHtml}
      ${bodyHtml}
    </article>
  </body>
</html>
`;
}

function homeTemplate(posts) {
  const list = posts
    .map((p) => `<li><a href="${p.relativeUrl}">${escapeHtml(p.title)}</a><div class="meta">${formatDate(p.date)} — ${escapeHtml(p.summary || '')}</div></li>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Blog</title>
    <meta name="description" content="Daily writing repository." />
    <style>
      :root { color-scheme: light dark; }
      body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; line-height: 1.6; max-width: 900px; margin: 40px auto; padding: 0 16px; }
      h1 { margin-bottom: 0.35rem; }
      p, .meta { color: #666; }
      a { color: #0a58ca; text-decoration: none; }
      a:hover { text-decoration: underline; }
      ul { padding-left: 1.2rem; }
      li { margin: 0.8rem 0; }
    </style>
  </head>
  <body>
    <h1>Blog</h1>
    <p>Daily writing repository.</p>
    <h2>Posts</h2>
    <ul>
      ${list}
    </ul>
    <p><a href="./index.json">Machine-readable index (index.json)</a></p>
  </body>
</html>
`;
}

if (!fs.existsSync(postsDir)) {
  console.error('posts/ directory not found');
  process.exit(1);
}

const files = walk(postsDir);
const posts = files.map((file) => {
  const relPath = path.relative(root, file).replaceAll(path.sep, '/');
  const raw = fs.readFileSync(file, 'utf8');
  const { data, content } = matter(raw);
  const title = String(data.title || path.basename(file, '.md'));
  const date = String(data.date || '');
  const summary = String(data.summary || '');
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const slug = getSlug(relPath, data);
  const dir = path.dirname(file);
  const outDir = path.join(dir, slug);
  ensureDir(outDir);
  const outPath = path.join(outDir, 'index.html');

  const canonicalUrl = getPostUrl(relPath, data);
  const bodyHtml = marked.parse(content);
  const html = postTemplate({ title, summary, date, tags, bodyHtml, canonicalUrl });
  fs.writeFileSync(outPath, html);

  return {
    title,
    date,
    summary,
    relativeUrl: `./${path.posix.dirname(relPath)}/${slug}/`,
  };
});

posts.sort((a, b) => (a.date < b.date ? 1 : -1));
fs.writeFileSync(path.join(root, 'index.html'), homeTemplate(posts));

console.log(`Rendered ${posts.length} post page(s) + homepage.`);
