/*
 * nwsapi selector benchmarks.
 *
 * A port of the legacy browser harness (test/speed, Benchmark.js v1.0.0) to
 * mitata running under Node.js + jsdom. For every (preset, selector) pair it
 * times NW.select(selector, document) against document.querySelectorAll(
 * selector). jsdom 30 resolves selectors with @asamuzakjp/dom-selector, NOT
 * nwsapi, so querySelectorAll is a genuine second engine.
 *
 * Like the old harness it also cross-checks the number of elements each
 * engine returns for every selector before timing it, and prints a
 * "result mismatches / errors" table at the end (the old yellow/FAILED
 * highlighting). Selectors that throw in BOTH engines are skipped from
 * timing with a note.
 *
 * Usage: node bench/selectors.bench.mjs [--list] [--json]
 *          [--preset <name>[,<name>...]] [--selector <substring-or-/regex/>]
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';
import { bench, do_not_optimize, group, run, summary } from 'mitata';

// src/nwsapi.js is CommonJS; its module.exports is the Factory function.
import nwsapiFactory from '../src/nwsapi.js';
import presets from './presets.mjs';

const benchDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(
  benchDir,
  '..',
  'test',
  'speed',
  'example',
  'selectors.html'
);

const USAGE = `nwsapi selector benchmarks (mitata + jsdom)

Usage:
  node bench/selectors.bench.mjs [options]

Options:
  --preset <name>     Run only the named preset group. Repeatable, and each
                      value may be a comma-separated list. Default: all.
  --selector <match>  Run only selectors whose text contains <match>, or,
                      when <match> is written /like-this/i, selectors that
                      match the regular expression.
  --list              Print preset names with selector counts and exit.
  --json              Have mitata emit JSON results on stdout; mismatch and
                      error records are then emitted as JSON on stderr so
                      stdout stays machine-readable.
  --help              Show this help.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseCli(argv) {
  // pnpm forwards a literal "--" separator (e.g. `pnpm run bench -- --list`);
  // strip it so the flags after it stay flags instead of positionals
  const args = argv.filter((arg, i) => !(arg === '--' && argv.indexOf('--') === i));
  try {
    return parseArgs({
      args,
      allowPositionals: false,
      options: {
        preset: { type: 'string', multiple: true },
        selector: { type: 'string' },
        list: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    }).values;
  } catch (error) {
    fail(`${error.message}\n\n${USAGE}`);
  }
}

function resolvePresetNames(rawValues) {
  const available = Object.keys(presets);
  const requested = (rawValues ?? [])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  if (requested.length === 0) {
    return available;
  }
  const unknown = requested.filter((name) => !Object.hasOwn(presets, name));
  if (unknown.length > 0) {
    fail(
      `Unknown preset(s): ${unknown.join(', ')}\n` +
        `Available presets:\n  ${available.join('\n  ')}`
    );
  }
  // De-duplicate while preserving the order the user asked for.
  return [...new Set(requested)];
}

function buildSelectorMatcher(raw) {
  if (raw === undefined) {
    return () => true;
  }
  const asRegExp = /^\/(.+)\/([a-z]*)$/.exec(raw);
  if (asRegExp) {
    let regexp;
    try {
      regexp = new RegExp(asRegExp[1], asRegExp[2]);
    } catch (error) {
      fail(`Invalid --selector regular expression: ${error.message}`);
    }
    return (selector) => regexp.test(selector);
  }
  return (selector) => selector.includes(raw);
}

function printList() {
  const names = Object.keys(presets);
  const width = Math.max(...names.map((name) => name.length));
  let total = 0;
  for (const name of names) {
    const count = presets[name].length;
    total += count;
    console.log(`${name.padEnd(width)}  ${String(count).padStart(3)} selectors`);
  }
  console.log(`${'total'.padEnd(width)}  ${String(total).padStart(3)} selectors`);
}

function describeProbe(count, error) {
  return error ? `ERROR: ${error.message}` : `${count} found`;
}

function printIssueTable(issues) {
  if (issues.length === 0) {
    console.log('\nresult check: no mismatches or engine errors.');
    return;
  }
  console.log('\nresult mismatches / errors');
  const rows = issues.map((issue) => [
    issue.preset,
    issue.selector,
    issue.nwsapi,
    issue.jsdom,
    issue.status,
  ]);
  const head = ['preset', 'selector', 'nwsapi', 'jsdom qsa', 'status'];
  const widths = head.map((label, i) =>
    Math.max(label.length, ...rows.map((row) => row[i].length))
  );
  const line = (cells) =>
    cells.map((cell, i) => cell.padEnd(widths[i])).join('  ');
  console.log(line(head));
  console.log(line(widths.map((width) => '-'.repeat(width))));
  for (const row of rows) {
    console.log(line(row));
  }
}

async function main() {
  const values = parseCli(process.argv.slice(2));

  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (values.list) {
    printList();
    return;
  }

  const presetNames = resolvePresetNames(values.preset);
  const matchesSelector = buildSelectorMatcher(values.selector);

  // One shared JSDOM instance (and one nwsapi instance bound to it) for the
  // whole process. The legacy harness loaded the fixture into fresh iframes,
  // but by the time Benchmark.js finished its warmup cycles both engines were
  // running against a fully parsed, warm document anyway -- so sharing a
  // single warmed document matches what the old numbers actually measured
  // (steady-state selection speed, with each engine's internal selector
  // caches primed). The tradeoff: cold-start costs (first parse/compile of a
  // selector) are amortized away and are not visible in these results.
  //
  // runScripts is deliberately NOT enabled: the saved fixture page ends with
  // spec-toolchain scripts that throw when executed.
  const html = readFileSync(FIXTURE_PATH, 'utf8');
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const NW = nwsapiFactory({
    document,
    DOMException: dom.window.DOMException,
  });

  const plan = [];
  const issues = [];

  for (const presetName of presetNames) {
    for (const selector of presets[presetName]) {
      if (!matchesSelector(selector)) {
        continue;
      }

      // One-shot correctness probe before timing: compare the number of
      // elements returned by each engine (the old harness's cross-check).
      let nwCount = null;
      let nwError = null;
      let qsaCount = null;
      let qsaError = null;
      try {
        nwCount = NW.select(selector, document).length;
      } catch (error) {
        nwError = error;
      }
      try {
        qsaCount = document.querySelectorAll(selector).length;
      } catch (error) {
        qsaError = error;
      }

      const record = {
        preset: presetName,
        selector,
        nwsapi: describeProbe(nwCount, nwError),
        jsdom: describeProbe(qsaCount, qsaError),
      };

      if (nwError && qsaError) {
        // Both engines reject the selector (the old harness expected
        // failures here, e.g. dynamic pseudo-classes): nothing to time.
        issues.push({ ...record, status: 'skipped (both engines threw)' });
        continue;
      }
      if (nwError || qsaError) {
        // One engine fails: record it, but still time the pair so the
        // healthy engine gets a score (mitata reports the other as error,
        // like the old FAILED column).
        issues.push({ ...record, status: 'engine error' });
      } else if (nwCount !== qsaCount) {
        issues.push({ ...record, status: 'result mismatch' });
      }

      plan.push({ presetName, selector });
    }
  }

  if (plan.length === 0) {
    fail(
      'No selectors matched the given --preset/--selector filters ' +
        '(and none were timeable).'
    );
  }

  for (const { presetName, selector } of plan) {
    group(`${presetName} ▸ ${selector}`, () => {
      summary(() => {
        bench('nwsapi', () => {
          do_not_optimize(NW.select(selector, document));
        });
        bench('jsdom qsa', () => {
          do_not_optimize(document.querySelectorAll(selector));
        });
      });
    });
  }

  await run(values.json ? { format: 'json' } : {});

  if (values.json) {
    // Keep stdout pure mitata JSON; ship the correctness report on stderr.
    process.stderr.write(`${JSON.stringify({ issues }, null, 2)}\n`);
  } else {
    printIssueTable(issues);
  }
}

await main();
