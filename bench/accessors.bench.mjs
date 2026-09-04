/*
 * What one host access costs, and which spelling of a test is cheapest.
 *
 * Almost all of a query's cost is calls across the host boundary, so the
 * decisions in the code generator come down to a table of per-element costs
 * and a handful of two-way comparisons. This produces both, which is where
 * every number in docs/performance.md's "Where the time goes" and "Prefer the
 * property to the call" sections comes from.
 *
 * Usage:
 *   node bench/accessors.bench.mjs [--doc documentation] [--rounds 5]
 *     [--markdown]
 */

import process from 'node:process';
import { parseArgs } from 'node:util';

import { DOCUMENTS } from './lib/documents.mjs';
import { compare } from './lib/timing.mjs';
import { world } from './lib/world.mjs';

const { values } = parseArgs({
  args: process.argv.slice(2).filter(arg => arg !== '--'),
  options: {
    doc: { type: 'string' },
    rounds: { type: 'string' },
    markdown: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log('Usage: node bench/accessors.bench.mjs [--doc documentation|atomic|components]' +
    ' [--rounds 5] [--markdown]');
  process.exit(0);
}

const docName = values.doc ?? 'documentation';
const rounds = values.rounds ? Number.parseInt(values.rounds, 10) : 5;
const spec = DOCUMENTS[docName];

if (!spec) {
  console.error(`Unknown document '${docName}'. Try one of: ${Object.keys(DOCUMENTS).join(', ')}`);
  process.exit(1);
}

const place = world(spec.html());
const { document } = place;
const all = place.all('*');
const links = place.all('a');

// Each variant reads one thing per element and consumes the value, so nothing
// is optimized away and the loop itself is the same in every row.
const READS = {
  'e.localName': set => { let n = 0; for (const e of set) { n += e.localName.length; } return n; },
  'e.nodeName': set => { let n = 0; for (const e of set) { n += e.nodeName.length; } return n; },
  'e.className': set => { let n = 0; for (const e of set) { n += e.className.length; } return n; },
  'e.id': set => { let n = 0; for (const e of set) { n += e.id.length; } return n; },
  'e.parentElement': set => { let n = 0; for (const e of set) { n += e.parentElement ? 1 : 0; } return n; },
  'e.firstElementChild': set => { let n = 0; for (const e of set) { n += e.firstElementChild ? 1 : 0; } return n; },
  'e.nextElementSibling': set => { let n = 0; for (const e of set) { n += e.nextElementSibling ? 1 : 0; } return n; },
  'e.previousElementSibling': set => { let n = 0; for (const e of set) { n += e.previousElementSibling ? 1 : 0; } return n; },
  'e.children.length': set => { let n = 0; for (const e of set) { n += e.children.length; } return n; },
  "e.getAttribute('id')": set => { let n = 0; for (const e of set) { n += e.getAttribute('id') ? 1 : 0; } return n; },
  "e.getAttribute('class')": set => { let n = 0; for (const e of set) { n += e.getAttribute('class') ? 1 : 0; } return n; },
  "e.getAttribute('href')": set => { let n = 0; for (const e of set) { n += e.getAttribute('href') ? 1 : 0; } return n; },
  "e.hasAttribute('href')": set => { let n = 0; for (const e of set) { n += e.hasAttribute('href') ? 1 : 0; } return n; },
  'e.attributes.length': set => { let n = 0; for (const e of set) { n += e.attributes.length; } return n; },
  'e.classList.length': set => { let n = 0; for (const e of set) { n += e.classList.length; } return n; },
};

const CLASS_RE = /(^|\s)example(\s|$)/;

function classOf(e) {
  const value = e.className;
  return typeof value == 'string' ? value : e.getAttribute('class');
}

function scanClass(value, name) {
  if (!value) { return false; }
  let at = value.indexOf(name);
  while (at !== -1) {
    const before = at === 0 || value.charCodeAt(at - 1) <= 32;
    const afterAt = at + name.length;
    const after = afterAt === value.length || value.charCodeAt(afterAt) <= 32;
    if (before && after) { return true; }
    at = value.indexOf(name, at + 1);
  }
  return false;
}

// Two-way comparisons, each one a decision the code generator makes.
const CHOICES = [
  {
    title: 'testing a class on every element',
    note: 'the class attribute is reflected as a property, so the property read wins',
    set: all,
    variants: {
      "regex on getAttribute('class')": set => { let n = 0; for (const e of set) { if (CLASS_RE.test(e.getAttribute('class'))) { ++n; } } return n; },
      'regex on e.className': set => { let n = 0; for (const e of set) { if (CLASS_RE.test(e.className)) { ++n; } } return n; },
      'regex through a helper call': set => { let n = 0; for (const e of set) { if (CLASS_RE.test(classOf(e))) { ++n; } } return n; },
      'hand-rolled scan of e.className': set => { let n = 0; for (const e of set) { if (scanClass(e.className, 'example')) { ++n; } } return n; },
      'classList.contains': set => { let n = 0; for (const e of set) { if (e.classList.contains('example')) { ++n; } } return n; },
    },
  },
  {
    title: 'testing an id on every element',
    note: 'a selector asks for an exact value, which is a comparison and not a pattern',
    set: all,
    variants: {
      "regex on getAttribute('id')": set => { let n = 0; for (const e of set) { if (/^title$/.test(e.getAttribute('id'))) { ++n; } } return n; },
      "compare getAttribute('id')": set => { let n = 0; for (const e of set) { if (e.getAttribute('id') === 'title') { ++n; } } return n; },
      'compare e.id': set => { let n = 0; for (const e of set) { if (e.id === 'title') { ++n; } } return n; },
    },
  },
  {
    title: 'an attribute presence test, with and without the guard',
    note: 'the guard is one property read per candidate to learn what the fetch already guarantees',
    set: all,
    variants: {
      'guarded e.hasAttribute("href")': set => { let n = 0; for (const e of set) { if (e.hasAttribute && e.hasAttribute('href')) { ++n; } } return n; },
      'bare e.hasAttribute("href")': set => { let n = 0; for (const e of set) { if (e.hasAttribute('href')) { ++n; } } return n; },
    },
  },
  {
    title: 'an attribute value test, with and without the guard',
    note: 'same read, and the same answer, on a test that also compares',
    set: all,
    variants: {
      'guarded e.getAttribute("href")': set => { let n = 0; for (const e of set) { if (e.getAttribute && e.getAttribute('href') === '#') { ++n; } } return n; },
      'bare e.getAttribute("href")': set => { let n = 0; for (const e of set) { if (e.getAttribute('href') === '#') { ++n; } } return n; },
    },
  },
  {
    title: 'copying a live collection into an array',
    note: 'item() and the iterator ask the host per index and are quadratic through its proxy',
    set: links,
    variants: {
      'slice.call': () => Array.prototype.slice.call(document.getElementsByTagName('a')),
      'index loop': () => {
        const c = document.getElementsByTagName('a');
        const n = c.length;
        const out = Array(n);
        for (let i = 0; i < n; ++i) { out[i] = c[i]; }
        return out;
      },
      'item() loop': () => {
        const c = document.getElementsByTagName('a');
        const n = c.length;
        const out = Array(n);
        for (let i = 0; i < n; ++i) { out[i] = c.item(i); }
        return out;
      },
      'Array.from': () => Array.from(document.getElementsByTagName('a')),
    },
  },
  {
    title: 'finding the elements of one class',
    note: 'asking the host for a named index beats testing per element, whichever test',
    set: all,
    variants: {
      'getElementsByClassName': () => document.getElementsByClassName('example').length,
      'regex per element': set => { let n = 0; for (const e of set) { if (CLASS_RE.test(classOf(e))) { ++n; } } return n; },
      'hand-rolled scan per element': set => { let n = 0; for (const e of set) { if (scanClass(e.className, 'example')) { ++n; } } return n; },
      'classList.contains per element': set => { let n = 0; for (const e of set) { if (e.classList.contains('example')) { ++n; } } return n; },
    },
  },
];

// ---------------------------------------------------------------------------

const rows = [];
for (const [label, read] of Object.entries(READS)) {
  const [{ ms }] = compare({ [label]: () => read(all) }, { rounds, iterations: 40 });
  rows.push({ label, ms });
}
rows.sort((a, b) => a.ms - b.ms);

if (values.markdown) {
  console.log(`Over ${all.length} elements in jsdom (${spec.note}), one read per element` +
    ' and nothing else, with the value consumed so it cannot be optimized away:\n');
  const width = Math.max(...rows.map(row => row.label.length + 2));
  console.log(`| ${'read'.padEnd(width)} | cost     |`);
  console.log(`| ${'-'.repeat(width)} | -------- |`);
  for (const row of rows) {
    console.log(`| ${`\`${row.label}\``.padEnd(width)} | ${row.ms.toFixed(3)} ms |`);
  }
} else {
  console.log(`host reads over ${all.length} elements (${docName}), cheapest first`);
  const width = Math.max(...rows.map(row => row.label.length));
  for (const row of rows) {
    console.log(`  ${row.label.padEnd(width)}  ${row.ms.toFixed(3)} ms`);
  }
}

for (const choice of CHOICES) {
  const answers = Object.values(choice.variants).map(fn => fn(choice.set));
  const agree = answers.every(answer => answer === answers[0] ||
    (typeof answer === 'object' && answer.length === answers[0].length));
  const timed = compare(
    Object.fromEntries(Object.entries(choice.variants).map(([label, fn]) => [label, () => fn(choice.set)])),
    { rounds },
  );
  timed.sort((a, b) => a.ms - b.ms);

  if (values.markdown) {
    console.log('');
    console.log(`**${choice.title}** — ${choice.note}\n`);
    const width = Math.max(...timed.map(row => row.label.length + 2));
    console.log(`| ${'how'.padEnd(width)} | cost     |`);
    console.log(`| ${'-'.repeat(width)} | -------- |`);
    for (const row of timed) {
      console.log(`| ${`\`${row.label}\``.padEnd(width)} | ${row.ms.toFixed(3)} ms |`);
    }
  } else {
    console.log('');
    console.log(`${choice.title}${agree ? '' : '   (VARIANTS DISAGREE)'}`);
    const width = Math.max(...timed.map(row => row.label.length));
    for (const row of timed) {
      console.log(`  ${row.label.padEnd(width)}  ${row.ms.toFixed(3)} ms` +
        (row === timed[0] ? '' : `   ${(row.ms / timed[0].ms).toFixed(2)}x`));
    }
  }
}
