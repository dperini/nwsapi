/*
 * Check every link in the built upstream patch messages.
 *
 * Each patch carries a references block: the spec that defines the behavior,
 * the Chromium line that implements it, MDN where a reader wants prose, and
 * whatever else the change was reasoned from. A dead link in a pull request
 * is worse than no link, and a pinned Chromium line that has drifted past the
 * end of its file is worse still, so both are checked: the URL has to answer
 * 200, and a '#L<n>' has to be inside the file it points at.
 *
 * Build the messages first, then run this:
 *
 *   node scripts/upstream-patches.mjs <upstream-checkout>
 *   node scripts/check-references.mjs <upstream-checkout>
 */

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const target = process.argv[2];

if (!target) {
  console.error('Usage: node scripts/check-references.mjs <upstream-checkout>');
  process.exit(1);
}

const dir = path.join(target, '.patches');
const messages = readdirSync(dir).filter(file => file.endsWith('.msg'));

if (!messages.length) {
  console.error(`No patch messages in ${dir}. Run scripts/upstream-patches.mjs first.`);
  process.exit(1);
}

const urls = new Map();
for (const file of messages) {
  const text = readFileSync(path.join(dir, file), 'utf8');
  for (const match of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    const url = match[0].replace(/[.,]$/, '');
    if (!urls.has(url)) { urls.set(url, []); }
    urls.get(url).push(file.replace(/\.msg$/, ''));
  }
}

const status = url => {
  try {
    return Number(execSync(
      `curl -sSL -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' --max-time 25 ${JSON.stringify(url)}`,
      { encoding: 'utf8' }));
  } catch {
    return 0;
  }
};

const lengths = new Map();
const linesIn = raw => {
  if (!lengths.has(raw)) {
    try {
      lengths.set(raw, Number(execSync(
        `curl -sSL --max-time 30 ${JSON.stringify(raw)} | wc -l`, { encoding: 'utf8' }).trim()));
    } catch {
      lengths.set(raw, 0);
    }
  }
  return lengths.get(raw);
};

console.log(`${urls.size} distinct links across ${messages.length} patch messages`);

let bad = 0;
for (const [url, patches] of urls) {
  const code = status(url);
  let note = '';
  const line = url.match(/#L(\d+)$/);
  if (code === 200 && line && url.includes('chromium/chromium/blob/')) {
    const raw = url
      .replace('https://github.com/chromium/chromium/blob/',
        'https://raw.githubusercontent.com/chromium/chromium/')
      .replace(/#L\d+$/, '');
    const total = linesIn(raw);
    if (Number(line[1]) > total) { note = ` line ${line[1]} is past the end (${total})`; }
  }
  const ok = code === 200 && !note;
  if (!ok) { bad += 1; }
  console.log(`  ${ok ? 'ok  ' : 'BAD '} ${String(code).padEnd(4)} ${url}${note}`);
  if (!ok) { console.log(`         cited by ${patches.join(', ')}`); }
}

console.log('');
console.log(bad
  ? `${bad} link(s) do not resolve`
  : 'every link resolves, and every pinned line is inside its file');
process.exitCode = bad ? 1 : 0;
