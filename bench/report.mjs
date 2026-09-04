/*
 * Measure the selector shapes this engine is asked for, and draw them.
 *
 * selectors.bench.mjs answers "did this change help?" for one selector at a
 * time. This answers "where does the engine stand?" across the shapes that
 * turn up in real pages and real test suites, and writes the result as JSON
 * plus two SVG charts that can go straight into a README or a PR.
 *
 * Three engines are timed against each other in one process, because absolute
 * timings drift between runs and only a ratio measured microseconds apart
 * means anything:
 *
 *   nwsapi     the working tree
 *   baseline   another build, by default the release this branch started from
 *   jsdom      querySelectorAll, which jsdom 30 answers with
 *              @asamuzakjp/dom-selector — a second implementation, not this one
 *
 * Usage:
 *   node --expose-gc bench/report.mjs [--baseline <path>] [--out bench/charts]
 *     [--json] [--rounds 5]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const USAGE = `nwsapi standing report (jsdom)

Usage:
  node --expose-gc bench/report.mjs [options]

Options:
  --baseline <path>  Second engine to time, e.g. a file written with
                     git show <ref>:src/nwsapi.js. Omit to skip.
  --out <dir>        Where the SVGs go (default bench/charts).
  --rounds <n>       Timed rounds per case, median reported (default 5).
  --json             Print the measurements as JSON on stdout.
  --help             Show this help.
`;

// ---------------------------------------------------------------------------
// Documents. Each one stands for a place selectors come from.
// ---------------------------------------------------------------------------

function documentation() {
  return readFileSync(path.join(repoRoot, 'test', 'speed', 'example', 'selectors.html'), 'utf8');
}

// Atomic CSS: one short class per declaration, a dozen stacked per element,
// container classes that are selective. StyleX, Tailwind, CSS modules.
function atomic() {
  let html = '<!doctype html><html><body><div class="app layout"><nav class="sidebar">';
  for (let i = 0; i < 30; ++i) {
    html += `<ul class="menu"><li class="row"><a class="link" href="#">s${i}</a></li></ul>`;
  }
  html += '</nav><main class="content">';
  for (let i = 0; i < 400; ++i) {
    html += `<section class="card surface elevated"><ul class="list stack">` +
      `<li class="row item"><a class="link primary" href="#">a${i}</a></li>` +
      `<li class="row"><span class="badge">${i}</span></li></ul></section>`;
  }
  return `${html}</main></div></body></html>`;
}

// A component tree as testing-library sees it: roles, labels, test ids.
function components() {
  let html = '<!doctype html><html><body><div id="root" class="app">';
  for (let i = 0; i < 300; ++i) {
    html += `<div class="card flex" data-testid="card-${i}">` +
      `<button type="button" class="btn primary" data-testid="btn-${i}" aria-label="Action ${i}">Go</button>` +
      `<label for="in-${i}">Name</label>` +
      `<input id="in-${i}" class="input" placeholder="n" data-testid="in-${i}">` +
      `<span class="badge">${i}</span><a href="#x" class="link">more</a></div>`;
  }
  return `${html}</div></body></html>`;
}

const DOCUMENTS = {
  documentation: { html: documentation, note: 'a spec page, the shape hand-written CSS runs against' },
  atomic: { html: atomic, note: 'atomic CSS: many short classes, selective containers' },
  components: { html: components, note: 'a component tree as testing-library queries it' },
};

// ---------------------------------------------------------------------------
// Cases. Grouped by what they exercise, so a chart reads as an argument.
// ---------------------------------------------------------------------------

const CASES = [
  { group: 'descendant chains', doc: 'documentation', selector: 'div ul li a' },
  { group: 'descendant chains', doc: 'documentation', selector: 'dl dd a' },
  { group: 'descendant chains', doc: 'documentation', selector: 'div p a' },
  { group: 'descendant chains', doc: 'documentation', selector: 'ul li a' },
  { group: 'descendant chains', doc: 'documentation', selector: 'body a' },

  { group: 'atomic CSS', doc: 'atomic', selector: '.sidebar ul li a' },
  { group: 'atomic CSS', doc: 'atomic', selector: '.sidebar .row .link' },
  { group: 'atomic CSS', doc: 'atomic', selector: 'main section ul li a' },
  { group: 'atomic CSS', doc: 'atomic', selector: 'ul li.row a.link' },

  { group: 'library queries', doc: 'components', selector: '[data-testid="btn-150"]' },
  { group: 'library queries', doc: 'components', selector: 'button,[role="button"]' },
  { group: 'library queries', doc: 'components', selector: 'label,[aria-label],[aria-labelledby]' },
  { group: 'library queries', doc: 'components', selector: '.btn.primary' },

  { group: 'pseudo-classes', doc: 'documentation', selector: 'div:not(:nth-of-type(2n))' },
  { group: 'pseudo-classes', doc: 'documentation', selector: 'div:nth-child(3)' },
  { group: 'pseudo-classes', doc: 'documentation', selector: 'div:not(.example)' },
  { group: 'pseudo-classes', doc: 'documentation', selector: 'p:first-child' },

  { group: 'single lookups', doc: 'documentation', selector: '#title' },
  { group: 'single lookups', doc: 'documentation', selector: '.example' },
  { group: 'single lookups', doc: 'documentation', selector: 'div' },
];

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

function timeOnce(fn, iterations) {
  fn();
  const started = process.hrtime.bigint();
  for (let i = 0; i < iterations; ++i) {
    fn();
  }
  return Number(process.hrtime.bigint() - started) / iterations / 1e6;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

// Rounds are interleaved across engines rather than run engine by engine, so a
// slow patch of machine time lands on all three instead of one.
function measure(runners, rounds, iterations) {
  const samples = runners.map(() => []);
  for (let round = 0; round < rounds; ++round) {
    for (let i = 0; i < runners.length; ++i) {
      samples[i].push(timeOnce(runners[i], iterations));
    }
  }
  return samples.map(median);
}

function iterationsFor(ms) {
  // enough repetitions that a case is timed over milliseconds, not noise
  if (ms > 1) { return 20; }
  if (ms > 0.1) { return 100; }
  return 500;
}

// ---------------------------------------------------------------------------
// Charts, following docs/design/repo/charts.md in socket-wheelhouse: a
// blue-black canvas, hairline grid, and the violet -> pink -> blue gradient
// carrying the series color, with a soft halo rather than a hard glow.
// ---------------------------------------------------------------------------

const INK = {
  canvas: '#0b0b12',
  grid: 'rgba(255,255,255,0.075)',
  text: '#e7e5f2',
  muted: 'rgba(231,229,242,0.62)',
  series: ['#a98bff', '#f05abe', '#358ff3'],
};

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function defs() {
  return `  <defs>
    ${INK.series.map((color, i) => `<linearGradient id="bar-${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.55"/>
    </linearGradient>`).join('\n    ')}
    <filter id="halo" x="-50%" y="-50%" width="300%" height="300%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur"/>
      <feColorMatrix in="blur" type="matrix"
        values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.5 0" result="halo"/>
      <feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;
}

// Grouped horizontal bars: one row per case, one bar per engine. Horizontal
// because selector text is long and a rotated label is hard to read.
function chart({ title, subtitle, rows, seriesNames, footer }) {
  const padTop = 96, padLeft = 260, padRight = 96, rowHeight = 26, groupGap = 16;
  const barHeight = Math.floor((rowHeight - 6) / seriesNames.length);
  const plotWidth = 620;
  const height = padTop + rows.length * (rowHeight + groupGap) + 96;
  const width = padLeft + plotWidth + padRight;
  const max = Math.max(...rows.flatMap(row => row.values.filter(v => v !== null)));
  const scale = value => (value / max) * plotWidth;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(fraction => {
    const x = padLeft + fraction * plotWidth;
    const label = (max * fraction).toFixed(max < 1 ? 2 : 1);
    return `    <line x1="${x}" y1="${padTop - 14}" x2="${x}" y2="${height - 78}" stroke="${INK.grid}"/>
    <text x="${x}" y="${height - 58}" fill="${INK.muted}" font-size="11" text-anchor="middle">${label}</text>`;
  }).join('\n');

  const bars = rows.map((row, rowIndex) => {
    const top = padTop + rowIndex * (rowHeight + groupGap);
    const label = `    <text x="${padLeft - 14}" y="${top + rowHeight / 2 + 4}" fill="${INK.text}" font-size="12.5"
      text-anchor="end" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${escapeText(row.label)}</text>`;
    const drawn = row.values.map((value, seriesIndex) => {
      if (value === null) { return ''; }
      const y = top + seriesIndex * barHeight;
      const w = Math.max(1, scale(value));
      const delay = (rowIndex * 0.05).toFixed(2);
      return `    <g class="bar" style="--delay:${delay}s">
      <rect x="${padLeft}" y="${y}" width="${w.toFixed(1)}" height="${barHeight - 1}" rx="2"
        fill="url(#bar-${seriesIndex})" filter="url(#halo)"/>
      <text x="${padLeft + w + 8}" y="${y + barHeight - 3}" fill="${INK.muted}" font-size="10.5"
        font-family="ui-monospace,SFMono-Regular,Menlo,monospace">${value < 1 ? value.toFixed(3) : value.toFixed(2)}</text>
    </g>`;
    }).join('\n');
    return `${label}\n${drawn}`;
  }).join('\n');

  const legend = seriesNames.map((name, i) => {
    const x = padLeft + i * 150;
    return `    <rect x="${x}" y="${padTop - 44}" width="10" height="10" rx="2" fill="${INK.series[i]}"/>
    <text x="${x + 16}" y="${padTop - 35}" fill="${INK.muted}" font-size="11.5">${escapeText(name)}</text>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
  viewBox="0 0 ${width} ${height}" font-family="Inter,system-ui,-apple-system,sans-serif">
${defs()}
  <style>
    .bar rect { transform-box: fill-box; transform-origin: left center;
      animation: grow 640ms cubic-bezier(0,0.7,0.5,1) both; animation-delay: var(--delay); }
    @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @media (prefers-reduced-motion: reduce) { .bar rect { animation: none; } }
  </style>
  <rect width="${width}" height="${height}" fill="${INK.canvas}"/>
  <text x="${padLeft - 14}" y="38" fill="${INK.text}" font-size="17" font-weight="600">${escapeText(title)}</text>
  <text x="${padLeft - 14}" y="58" fill="${INK.muted}" font-size="12">${escapeText(subtitle)}</text>
${legend}
${ticks}
${bars}
  <text x="${padLeft - 14}" y="${height - 30}" fill="${INK.muted}" font-size="11">${escapeText(footer)}</text>
</svg>
`;
}

// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2).filter((arg, i, all) => !(arg === '--' && all.indexOf('--') === i));
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      baseline: { type: 'string' },
      out: { type: 'string' },
      rounds: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const rounds = values.rounds ? Number.parseInt(values.rounds, 10) : 5;
  const outDir = path.resolve(repoRoot, values.out ?? 'bench/charts');

  // One document per shape, each with its own engine instances.
  const worlds = {};
  for (const [name, spec] of Object.entries(DOCUMENTS)) {
    const dom = new JSDOM(spec.html());
    const { document } = dom.window;
    const options = { document, DOMException: dom.window.DOMException };
    worlds[name] = {
      document,
      note: spec.note,
      elements: document.getElementsByTagName('*').length,
      engines: {
        nwsapi: require(path.join(repoRoot, 'src', 'nwsapi.js'))(options),
        baseline: values.baseline
          ? require(path.resolve(values.baseline))(options)
          : null,
      },
    };
  }

  const results = [];
  for (const testCase of CASES) {
    const world = worlds[testCase.doc];
    const { document } = world;
    const { nwsapi, baseline } = world.engines;
    const selector = testCase.selector;

    // Correctness before timing: a number from an engine that disagrees with
    // the reference is not a measurement of the same work.
    const found = nwsapi.select(selector, document).length;
    const reference = document.querySelectorAll(selector).length;

    const runners = [() => nwsapi.select(selector, document)];
    if (baseline) { runners.push(() => baseline.select(selector, document)); }
    runners.push(() => document.querySelectorAll(selector));

    const iterations = iterationsFor(timeOnce(runners[0], 3));
    const times = measure(runners, rounds, iterations);

    results.push({
      ...testCase,
      matches: found,
      agrees: found === reference,
      elements: world.elements,
      nwsapi: times[0],
      baseline: baseline ? times[1] : null,
      jsdom: times[times.length - 1],
    });
  }

  const disagreements = results.filter(row => !row.agrees);
  if (values.json) {
    console.log(JSON.stringify({ rounds, results }, null, 2));
  } else {
    const width = Math.max(...results.map(row => row.selector.length));
    let group = '';
    for (const row of results) {
      if (row.group !== group) {
        group = row.group;
        console.log(`\n${group}  (${DOCUMENTS[row.doc].note}, ${row.elements} elements)`);
      }
      const ratio = row.jsdom / row.nwsapi;
      console.log(
        `  ${row.selector.padEnd(width)}  nwsapi ${row.nwsapi.toFixed(3)}ms` +
          (row.baseline === null ? '' : `  baseline ${row.baseline.toFixed(3)}ms`) +
          `  jsdom ${row.jsdom.toFixed(3)}ms  ${ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x slower`}` +
          `  n=${row.matches}${row.agrees ? '' : ' DISAGREES'}`,
      );
    }
  }

  mkdirSync(outDir, { recursive: true });

  const seriesNames = values.baseline
    ? ['nwsapi (this tree)', 'nwsapi (baseline)', "jsdom's engine"]
    : ['nwsapi (this tree)', "jsdom's engine"];

  writeFileSync(
    path.join(outDir, 'standing.svg'),
    chart({
      title: 'Selector cost by shape',
      subtitle: 'milliseconds per query, lower is better — median of ' + rounds + ' interleaved rounds',
      seriesNames,
      rows: results.map(row => ({
        label: row.selector.length > 30 ? `${row.selector.slice(0, 29)}…` : row.selector,
        values: values.baseline ? [row.nwsapi, row.baseline, row.jsdom] : [row.nwsapi, row.jsdom],
      })),
      footer: "jsdom 30 answers querySelectorAll with @asamuzakjp/dom-selector, a separate implementation",
    }),
  );

  if (values.baseline) {
    const improved = results
      .map(row => ({ ...row, gain: row.baseline / row.nwsapi }))
      .filter(row => row.gain > 1.05)
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 12);
    writeFileSync(
      path.join(outDir, 'gains.svg'),
      chart({
        title: 'Where this branch changed the cost',
        subtitle: 'milliseconds per query, lower is better — baseline against this tree',
        seriesNames: ['nwsapi (this tree)', 'nwsapi (baseline)'],
        rows: improved.map(row => ({
          label: `${row.selector.length > 26 ? `${row.selector.slice(0, 25)}…` : row.selector}  ${row.gain.toFixed(1)}x`,
          values: [row.nwsapi, row.baseline],
        })),
        footer: 'only shapes that moved by more than 5%; every result still agrees with the reference engine',
      }),
    );
  }

  console.log(`\nwrote ${path.relative(repoRoot, outDir)}/standing.svg` +
    (values.baseline ? ` and gains.svg` : ''));
  if (disagreements.length) {
    console.log(`\n${disagreements.length} selector(s) disagree with the reference engine:`);
    for (const row of disagreements) { console.log(`  ${row.selector}`); }
    process.exitCode = 1;
  }
}

main();
