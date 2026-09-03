/*
 * How large should CACHE_LIMIT be?
 *
 * nwsapi keeps four LRU caches (compiled match lambdas, compiled select
 * lambdas, match resolvers, select resolvers), all bounded by the same
 * CACHE_LIMIT, currently 1000. The fork of nwsapi inside jsdom's current
 * engine, @asamuzakjp/dom-selector, uses 4096, and its benchmark/bench-cache.js
 * sweeps that size by re-running the process with --size=. This does the same
 * sweep in one process, and reports the memory side as well, because the
 * question is a trade and not a maximum: a larger cache only buys throughput
 * once the working set stops fitting, and it is paid for in retained heap.
 *
 * The limit is a constant in the source, so each variant is materialized by
 * rewriting that one assignment into a temporary file. The rewrite asserts
 * its anchor, so a rename cannot silently produce a sweep of identical
 * engines.
 *
 * Three workloads, because they answer different questions:
 *   small   30 distinct selectors, everything hits after the first pass.
 *           A limit change must not cost anything here; this is what an
 *           ordinary page or test file looks like.
 *   spill   2000 distinct selectors: more than a 1000-entry cache holds and
 *           fewer than a 4096-entry one does. This is the decisive case, the
 *           one a bigger cache is bought for, and the size is deliberately
 *           the same for every engine — sizing it off each engine's own
 *           limit gives them different amounts of work and produces a
 *           speedup that is only the ratio of the two selector counts.
 *   large   8000 distinct selectors, over every limit tested, matching the
 *           size domSelector's own cache benchmark uses so the numbers can
 *           be read next to theirs.
 *
 * Usage:
 *   node --expose-gc bench/cache.bench.mjs [--limits 1000,4096] [--json]
 *     [--workload small,spill,large] [--nodes 5]
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';
import { bench, do_not_optimize, group, run, summary } from 'mitata';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const SOURCE = path.join(repoRoot, 'src', 'nwsapi.js');

const USAGE = `nwsapi cache size sweep (mitata + jsdom)

Usage:
  node --expose-gc bench/cache.bench.mjs [options]

Options:
  --limits <list>    Comma-separated CACHE_LIMIT values (default 1000,4096).
  --workload <list>  small, spill and/or large (default all three).
  --nodes <n>        Elements each selector is matched against (default 5).
  --json             Emit mitata JSON on stdout.
  --help             Show this help.
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Write a copy of the engine with a different CACHE_LIMIT.
function materialize(dir, limit, source) {
  const anchor = /(\n\s*CACHE_LIMIT = )(\d+)(,)/;
  if (!anchor.test(source)) {
    fail('Could not find the CACHE_LIMIT assignment in src/nwsapi.js.');
  }
  const file = path.join(dir, `nwsapi-${limit}.cjs`);
  writeFileSync(file, source.replace(anchor, `$1${limit}$3`));
  const patched = readFileSync(file, 'utf8');
  if (!new RegExp(`CACHE_LIMIT = ${limit},`).test(patched)) {
    fail(`Failed to set CACHE_LIMIT to ${limit}.`);
  }
  return file;
}

// Distinct selectors, each cheap to match, so the timing reflects cache
// behavior rather than traversal. Half match, half do not, as in
// domSelector's bench-cache.js.
function selectorSet(count) {
  const list = [];
  for (let i = 0; i < count; ++i) {
    list.push(
      i % 2 === 0
        ? `.benchmark-target:not(.dummy-${i})`
        : `.dummy-class-${i} > div + p`,
    );
  }
  return list;
}

function settle() {
  for (let i = 0; i < 4; ++i) {
    globalThis.gc();
  }
  return process.memoryUsage().heapUsed;
}

function main() {
  const args = process.argv
    .slice(2)
    .filter((arg, i, all) => !(arg === '--' && all.indexOf('--') === i));
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      limits: { type: 'string' },
      workload: { type: 'string' },
      nodes: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }
  if (typeof globalThis.gc !== 'function') {
    fail('This benchmark needs --expose-gc.');
  }

  const limits = (values.limits ?? '1000,4096')
    .split(',')
    .map(value => Number.parseInt(value.trim(), 10));
  if (limits.some(limit => !Number.isInteger(limit) || limit < 1)) {
    fail('--limits takes positive integers, e.g. --limits 250,1000,4096');
  }

  const workloads = (values.workload ?? 'small,spill,large')
    .split(',')
    .map(value => value.trim());
  const known = ['small', 'spill', 'large'];
  const unknown = workloads.filter(name => !known.includes(name));
  if (unknown.length > 0) {
    fail(`Unknown workload(s): ${unknown.join(', ')}. Known: ${known.join(', ')}`);
  }

  const nodeCount = values.nodes ? Number.parseInt(values.nodes, 10) : 5;

  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const { document } = dom.window;
  const nodes = [];
  for (let i = 0; i < nodeCount; ++i) {
    const div = document.createElement('div');
    div.classList.add('benchmark-target');
    div.id = `node-${i}`;
    document.body.appendChild(div);
    nodes.push(div);
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-cache-'));
  const source = readFileSync(SOURCE, 'utf8');

  try {
    const engines = limits.map(limit => ({
      limit,
      factory: require(materialize(dir, limit, source)),
    }));

    // Memory first: fill each cache to its limit and read the retained heap.
    // Done before timing, so a warm code cache does not skew the readings.
    const footprint = engines.map(({ limit, factory }) => {
      const selectors = selectorSet(limit);
      const engineDom = new JSDOM('<!doctype html><html><body><div class=x></div></body></html>');
      const NW = factory({
        document: engineDom.window.document,
        DOMException: engineDom.window.DOMException,
      });
      const before = settle();
      for (const selector of selectors) {
        NW.select(selector, engineDom.window.document);
      }
      const after = settle();
      if (!NW) {
        throw new Error('unreachable');
      }
      return { limit, full: after - before, perEntry: (after - before) / limit };
    });

    const instances = engines.map(({ limit, factory }) => ({
      limit,
      NW: factory({ document, DOMException: dom.window.DOMException }),
    }));

    const sets = {
      small: () => selectorSet(30),
      spill: () => selectorSet(2000),
      large: () => selectorSet(8000),
    };

    for (const workload of workloads) {
      group(`cache ▸ ${workload}`, () => {
        summary(() => {
          for (const { limit, NW } of instances) {
            // Every engine gets the same selector list, so the only
            // difference between them is how much of it their cache holds.
            const args = [[sets[workload](), nodes]];
            bench(`limit ${limit}`, () => {
              const [selectors, targets] = args[0];
              for (let n = 0; n < targets.length; ++n) {
                for (let s = 0; s < selectors.length; ++s) {
                  do_not_optimize(NW.match(selectors[s], targets[n]));
                }
              }
            });
          }
        });
      });
    }

    console.log('retained heap with the cache filled to its limit');
    for (const { limit, full, perEntry } of footprint) {
      console.log(
        `  limit ${String(limit).padStart(5)}  ` +
          `${(full / (1024 * 1024)).toFixed(2)} mb total  ` +
          `${(perEntry / 1024).toFixed(2)} kb/entry`,
      );
    }
    console.log('');

    return run(values.json ? { format: 'json' } : {}).finally(() => {
      rmSync(dir, { recursive: true, force: true });
    });
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

await main();
