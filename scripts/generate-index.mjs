import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const root = process.cwd();
const postsDir = path.join(root, 'posts');
const siteBase = 'https://my-slops.github.io/Blog';

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

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getSlug(relPath, data) {
  if (data.slug) return String(data.slug);
  return path.basename(relPath, '.md');
}

function getPostUrl(relPath, data) {
  const dirRel = path.posix.dirname(relPath);
  const slug = getSlug(relPath, data);
  return `${siteBase}/${dirRel}/${slug}/`;
}

if (!fs.existsSync(postsDir)) {
  console.error('No posts directory found');
  process.exit(1);
}

const files = walk(postsDir);
const posts = files
  .map((file) => {
    const relPath = path.relative(root, file).replaceAll(path.sep, '/');
    const raw = fs.readFileSync(file, 'utf8');
    const { data, content } = matter(raw);
    const title = String(data.title || path.basename(file, '.md'));
    const date = String(data.date || '1970-01-01');
    const updated = String(data.updated || date);
    const summary = String(data.summary || content.trim().split('\n').slice(0, 2).join(' '));
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const url = getPostUrl(relPath, data);
    return { title, date, updated, summary, tags, url, path: relPath };
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1));

fs.writeFileSync(
  path.join(root, 'index.json'),
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      count: posts.length,
      posts,
    },
    null,
    2
  )
);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${posts
  .map((p) => `  <url><loc>${escapeXml(p.url)}</loc><lastmod>${p.updated}</lastmod></url>`)
  .join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap);

const rssItems = posts
  .slice(0, 50)
  .map(
    (p) => `  <item>\n    <title>${escapeXml(p.title)}</title>\n    <link>${escapeXml(
      p.url
    )}</link>\n    <guid>${escapeXml(p.url)}</guid>\n    <pubDate>${new Date(
      p.date
    ).toUTCString()}</pubDate>\n    <description>${escapeXml(p.summary)}</description>\n  </item>`
  )
  .join('\n');

const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n  <title>My Slops Blog</title>\n  <link>${siteBase}</link>\n  <description>Daily writing, optimized for humans and LLMs.</description>\n  <language>en-us</language>\n${rssItems}\n</channel>\n</rss>\n`;
fs.writeFileSync(path.join(root, 'rss.xml'), rss);

const tagsDir = path.join(root, 'tags');
ensureDir(tagsDir);

const tagsMap = new Map();
for (const post of posts) {
  for (const tag of post.tags) {
    const key = String(tag).trim().toLowerCase();
    if (!key) continue;
    if (!tagsMap.has(key)) tagsMap.set(key, []);
    tagsMap.get(key).push(post);
  }
}

const tagsIndex = [];
for (const [tag, taggedPosts] of Array.from(tagsMap.entries()).sort()) {
  const payload = {
    tag,
    count: taggedPosts.length,
    posts: taggedPosts,
  };
  fs.writeFileSync(path.join(tagsDir, `${tag}.json`), JSON.stringify(payload, null, 2));
  tagsIndex.push({ tag, count: taggedPosts.length, url: `${siteBase}/tags/${tag}.json` });
}

fs.writeFileSync(
  path.join(tagsDir, 'index.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), tags: tagsIndex }, null, 2)
);

console.log(`Generated index.json, sitemap.xml, rss.xml, and ${tagsIndex.length} tag files.`);
