import fs from 'node:fs';
import path from 'node:path';

const postsDir = path.join(process.cwd(), 'posts');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && p.endsWith('.md')) out.push(p);
  }
  return out;
}

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return { data: null, body: content };
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) return { data: null, body: content };
  const raw = content.slice(4, end);
  const body = content.slice(end + 5);
  const data = {};

  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    } else {
      val = val.replace(/^"|"$/g, '');
    }
    data[key] = val;
  }

  return { data, body };
}

function isIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

const required = ['title', 'date', 'updated', 'summary', 'tags', 'status', 'canonical_url', 'license'];

if (!fs.existsSync(postsDir)) {
  console.error('posts/ directory not found');
  process.exit(1);
}

const files = walk(postsDir);
const errors = [];

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const raw = fs.readFileSync(file, 'utf8');
  const { data } = parseFrontmatter(raw);

  if (!data) {
    errors.push(`${rel}: missing valid frontmatter block`);
    continue;
  }

  for (const key of required) {
    if (!(key in data) || data[key] === '') {
      errors.push(`${rel}: missing required field '${key}'`);
    }
  }

  if (data.date && !isIsoDate(data.date)) {
    errors.push(`${rel}: invalid date format for 'date' (expected YYYY-MM-DD)`);
  }
  if (data.updated && !isIsoDate(data.updated)) {
    errors.push(`${rel}: invalid date format for 'updated' (expected YYYY-MM-DD)`);
  }
  if (data.tags && !Array.isArray(data.tags)) {
    errors.push(`${rel}: 'tags' must be an array`);
  }
  if (data.status && !['draft', 'published'].includes(data.status)) {
    errors.push(`${rel}: 'status' must be draft|published`);
  }
  if (data.canonical_url && !/^https:\/\//.test(data.canonical_url)) {
    errors.push(`${rel}: 'canonical_url' must be absolute https URL`);
  }
}

if (errors.length) {
  console.error('Frontmatter validation failed:\n');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(`Frontmatter validation passed for ${files.length} post(s).`);
