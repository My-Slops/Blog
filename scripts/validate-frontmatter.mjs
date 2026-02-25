import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

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

function isIsoDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s));
}

const required = ['title', 'date', 'summary', 'tags', 'status', 'canonical_url'];

if (!fs.existsSync(postsDir)) {
  console.error('posts/ directory not found');
  process.exit(1);
}

const files = walk(postsDir);
const errors = [];

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const raw = fs.readFileSync(file, 'utf8');
  const { data } = matter(raw);

  if (!data || Object.keys(data).length === 0) {
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
  if (data.status && !['draft', 'ready', 'published'].includes(String(data.status))) {
    errors.push(`${rel}: 'status' must be draft|ready|published`);
  }
  if (data.canonical_url && !/^https:\/\//.test(String(data.canonical_url))) {
    errors.push(`${rel}: 'canonical_url' must be absolute https URL`);
  }
}

if (errors.length) {
  console.error('Frontmatter validation failed:\n');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(`Frontmatter validation passed for ${files.length} post(s).`);
