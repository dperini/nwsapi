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
 *   baseline   another build, passed with --baseline
 *   jsdom      querySelectorAll, which jsdom 30 answers with
 *              @asamuzakjp/dom-selector - a second implementation, not this one
 *
 * The timing, the documents, the world builder and the charts are shared with
 * the other benchmarks here; see bench/lib/.
 *
 * Usage:
 *   node --expose-gc bench/report.mjs [--baseline <path>] [--out bench/charts]
 *     [--json] [--rounds 5]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { chart } from './lib/chart.mjs';
import { DOCUMENTS } from './lib/documents.mjs';
import { repoRoot } from './lib/paths.mjs';
import { iterationsFor, measure, timeOnce } from './lib/timing.mjs';
import { world } from './lib/world.mjs';

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
  // an id the resolver tests, rather than one it looks the candidates up by:
  // reOptimizer fetches by the rightmost part, so an id further left is
  // checked per candidate
  { group: 'library queries', doc: 'components', selector: '#root .card' },

  { group: 'pseudo-classes', doc: 'documentation', selector: 'div:not(:nth-of-type(2n))' },
  { group: 'pseudo-classes', doc: 'documentation', selector: 'div:nth-child(3)' },
  { group: 'pseudo-classes', doc: 'documentation', selector: 'div:not(.example)' },
  { group: 'pseudo-classes', doc: 'documentation', selector: 'p:first-child' },

  { group: 'single lookups', doc: 'documentation', selector: '#title' },
  { group: 'single lookups', doc: 'documentation', selector: '.example' },
  { group: 'single lookups', doc: 'documentation', selector: 'div' },
];

// A repeated query jsdom answers from its result cache costs a fraction of the
// same query after the document changed. Ours has no result cache, so the gap
// between the two regimes is what marks the row.
function isMemo(row) {
  return row.changedJsdom > row.jsdom * 4;
}

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
    worlds[name] = world(spec.html(), { baseline: values.baseline });
  }

  const results = [];
  for (const testCase of CASES) {
    const place = worlds[testCase.doc];
    const { document } = place;
    const { nwsapi, baseline } = place.engines;
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

    // The same queries again, with the document changed in between. jsdom 30's
    // engine keeps the result of a query until the document changes, so the
    // numbers above can be a memo answering rather than a selector matching.
    // Both engines pay the same change, and its own cost is subtracted.
    const touch = () => place.touch();
    const changedRunners = runners.map(run => () => { touch(); return run(); });
    const changedTimes = measure(
      [...changedRunners, touch], rounds, iterationsFor(timeOnce(changedRunners[0], 3)));
    const touchCost = changedTimes[changedTimes.length - 1];
    const changed = changedTimes.slice(0, -1).map(ms => Math.max(ms - touchCost, 0));

    results.push({
      ...testCase,
      matches: found,
      agrees: found === reference,
      elements: place.elements,
      nwsapi: times[0],
      baseline: baseline ? times[1] : null,
      jsdom: times[times.length - 1],
      changedNwsapi: changed[0],
      changedJsdom: changed[changed.length - 1],
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
        console.log('');
        console.log(`${group}  (${DOCUMENTS[row.doc].note}, ${row.elements} elements)`);
      }
      const ratio = row.jsdom / row.nwsapi;
      console.log(
        `  ${row.selector.padEnd(width)}  nwsapi ${row.nwsapi.toFixed(3)}ms` +
          (row.baseline === null ? '' : `  baseline ${row.baseline.toFixed(3)}ms`) +
          `  jsdom ${row.jsdom.toFixed(3)}ms  ${ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x slower`}` +
          `  n=${row.matches}${row.agrees ? '' : ' DISAGREES'}` +
          (isMemo(row) ? '  (jsdom answered from its result cache)' : ''),
      );
    }

    const memos = results.filter(isMemo);
    if (memos.length) {
      console.log('');
      console.log('the same shapes with the document changed between queries');
      const memoWidth = Math.max(...memos.map(row => row.selector.length));
      for (const row of memos) {
        const ratio = row.changedJsdom / row.changedNwsapi;
        console.log(
          `  ${row.selector.padEnd(memoWidth)}  nwsapi ${row.changedNwsapi.toFixed(3)}ms` +
            `  jsdom ${row.changedJsdom.toFixed(3)}ms  ` +
            (ratio >= 1 ? `${ratio.toFixed(1)}x faster` : `${(1 / ratio).toFixed(1)}x slower`),
        );
      }
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
        label: (row.selector.length > 30 ? `${row.selector.slice(0, 29)}…` : row.selector) +
          (isMemo(row) ? ' *' : ''),
        values: values.baseline ? [row.nwsapi, row.baseline, row.jsdom] : [row.nwsapi, row.jsdom],
      })),
      footer: 'jsdom 30 answers querySelectorAll with @asamuzakjp/dom-selector, a separate ' +
        'implementation.  * marks a shape it answered from its result cache, which holds until ' +
        'the document changes; run the report to see the same shape after a change',
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

  console.log('');

  console.log(`wrote ${path.relative(repoRoot, outDir)}/standing.svg` +
    (values.baseline ? ` and gains.svg` : ''));
  if (disagreements.length) {
    console.log('');
    console.log(`${disagreements.length} selector(s) disagree with the reference engine:`);
    for (const row of disagreements) { console.log(`  ${row.selector}`); }
    process.exitCode = 1;
  }
}

main();
