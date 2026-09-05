/*
 * nwsapi memory footprint measurements.
 *
 * Companion to selectors.bench.mjs: that one measures time, this one measures
 * retained heap. The questions it answers are the ones a jsdom-based test
 * suite runs into, where one engine instance exists per document and a
 * process can hold hundreds of documents at once:
 *
 *   - how much heap does one nwsapi instance retain?
 *   - how much does its selector cache add per distinct selector?
 *   - does the cache retain DOM nodes after the caller drops them?
 *
 * Method (following the zod memory bench this is modeled on): allocate N
 * copies of the thing being measured, keep them all reachable, force GC, and
 * divide the difference in retained heap by N. Measuring a single instance is
 * dominated by noise; measuring many amortizes it. Requires --expose-gc.
 *
 * Usage: node --expose-gc bench/memory.bench.mjs [--json] [--count <n>]
 *          [--compare <path-to-nwsapi.js>]
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

import nwsapiFactory from '../src/nwsapi.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const USAGE = `nwsapi memory footprint (jsdom)

Usage:
  node --expose-gc bench/memory.bench.mjs [options]

Options:
  --compare <path>  Measure a second nwsapi build from <path> as well, e.g.
                    git show 2e9498f:src/nwsapi.js > /tmp/upstream.js
  --count <n>       Instances per measurement (default 200).
  --rounds <n>      Measurement rounds, medianed, order alternating between
                    engines each round (default 3).
  --json            Emit results as JSON.
  --help            Show this help.
`;

if (typeof globalThis.gc !== 'function') {
  console.error('This benchmark needs --expose-gc:\n  node --expose-gc bench/memory.bench.mjs');
  process.exit(1);
}

function settle() {
  // A single collection leaves recently-dead objects behind; several passes
  // with a turn of the event loop between them give finalizers a chance to
  // run, so the reading reflects what is genuinely retained.
  for (let i = 0; i < 4; ++i) {
    globalThis.gc();
  }
  return process.memoryUsage().heapUsed;
}

// Retained bytes per item, for a factory that produces one item per call. The
// items stay in an array so nothing is collected before the reading is taken.
function retainedPer(count, make) {
  const kept = new Array(count);
  const before = settle();
  for (let i = 0; i < count; ++i) {
    kept[i] = make(i);
  }
  const after = settle();
  // Touch the array afterwards so it cannot be optimized away.
  if (kept.length !== count) {
    throw new Error('unreachable');
  }
  return (after - before) / count;
}

function bytes(value) {
  const abs = Math.abs(value);
  if (abs >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} mb`;
  }
  if (abs >= 1024) {
    return `${(value / 1024).toFixed(2)} kb`;
  }
  return `${Math.round(value)} b`;
}

const HTML = '<!doctype html><html><body>' +
  '<div class="a"><p id="p1" class="b">one</p><p class="c">two</p></div>' +
  '<ul>' + '<li class="item">x</li>'.repeat(50) + '</ul>' +
  '</body></html>';

// Distinct selectors, so every one of them takes a fresh cache slot.
function selectorList(n) {
  const list = [];
  for (let i = 0; i < n; ++i) {
    list.push(`.item:nth-child(${(i % 40) + 1}) , div.a > p.b[id="p1"]:not(.x${i})`);
  }
  return list;
}

function measure(label, factory, count) {
  const results = { engine: label };

  // 1. One engine instance per document, nothing queried yet.
  results.instance = retainedPer(count, () => {
    const dom = new JSDOM(HTML);
    const NW = factory({
      document: dom.window.document,
      DOMException: dom.window.DOMException,
    });
    return [dom, NW];
  });

  // 2. The same, minus the document, isolating what the engine itself adds.
  const domOnly = retainedPer(count, () => new JSDOM(HTML));
  results.document = domOnly;
  results.engineOnly = results.instance - domOnly;

  // 3. Cache growth: one instance, N distinct selectors run through select().
  {
    const dom = new JSDOM(HTML);
    const NW = factory({
      document: dom.window.document,
      DOMException: dom.window.DOMException,
    });
    const selectors = selectorList(count);
    const before = settle();
    for (const selector of selectors) {
      NW.select(selector, dom.window.document);
    }
    const after = settle();
    results.perCachedSelector = (after - before) / count;
    // Keep both alive past the reading.
    if (!NW || !dom) {
      throw new Error('unreachable');
    }
  }

  // 4. DOM retention. Build a heavy subtree, optionally query it, then
  // detach it and drop every reference the harness holds. Whatever heap
  // survives in the queried run but not in the unqueried control is held by
  // the engine. Comparing against a control is what makes the number mean
  // something: the absolute heap after removal is dominated by the document
  // itself, and an earlier version of this benchmark reported retention that
  // was really its own local variable keeping the subtree alive.
  {
    const measureRemoval = (query) => {
      const dom = new JSDOM(HTML);
      const { document } = dom.window;
      const NW = factory({
        document,
        DOMException: dom.window.DOMException,
      });
      // The subtree exists only inside this call, so the only references
      // that can outlive it are the document's and the engine's.
      (() => {
        const host = document.createElement('div');
        host.className = 'host';
        for (let i = 0; i < 2000; ++i) {
          const node = document.createElement('span');
          node.className = 'leaf';
          node.setAttribute('data-payload', String(i).repeat(64));
          host.appendChild(node);
        }
        document.body.appendChild(host);
        if (query) {
          NW.select('div.host span.leaf', document);
        }
        host.remove();
      })();
      const after = settle();
      // Both must outlive the reading, or there is nothing to retain with.
      if (!NW || !dom) {
        throw new Error('unreachable');
      }
      return after;
    };

    const control = measureRemoval(false);
    const queried = measureRemoval(true);
    results.retainedAfterRemoval = queried - control;
  }

  return results;
}

function main() {
  const args = process.argv
    .slice(2)
    .filter((arg, i, all) => !(arg === '--' && all.indexOf('--') === i));
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      compare: { type: 'string' },
      count: { type: 'string' },
      rounds: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const count = values.count ? Number.parseInt(values.count, 10) : 200;
  if (!Number.isInteger(count) || count < 1) {
    console.error('--count must be a positive integer');
    process.exit(1);
  }

  const engines = [['src/nwsapi.js', nwsapiFactory]];
  if (values.compare !== undefined) {
    const comparePath = path.resolve(values.compare);
    engines.push([
      path.relative(path.resolve(here, '..'), comparePath) || comparePath,
      createRequire(import.meta.url)(comparePath),
    ]);
  }

  // Heap readings are order-sensitive: the engine measured second runs in a
  // warmer, more fragmented heap. Alternate the order across rounds and take
  // the median of each figure, so neither engine keeps the same position.
  const rounds = values.rounds ? Number.parseInt(values.rounds, 10) : 3;
  if (!Number.isInteger(rounds) || rounds < 1) {
    console.error('--rounds must be a positive integer');
    process.exit(1);
  }

  const samples = engines.map(() => []);
  for (let round = 0; round < rounds; ++round) {
    const order = round % 2 === 0
      ? engines.map((engine, i) => i)
      : engines.map((engine, i) => engines.length - 1 - i);
    for (const i of order) {
      const [label, factory] = engines[i];
      samples[i].push(measure(label, factory, count));
    }
  }

  const median = (values_) => {
    const sorted = [...values_].sort((a_, b_) => a_ - b_);
    return sorted[(sorted.length - 1) >> 1];
  };
  const all = samples.map((rows, i) => {
    const merged = { engine: engines[i][0] };
    for (const key of Object.keys(rows[0])) {
      if (key !== 'engine') {
        merged[key] = median(rows.map(row => row[key]));
      }
    }
    return merged;
  });

  if (values.json) {
    console.log(JSON.stringify({ count, results: all }, null, 2));
    return;
  }

  const rows = [
    ['jsdom document alone', 'document'],
    ['engine instance only', 'engineOnly'],
    ['document + engine', 'instance'],
    ['per cached selector', 'perCachedSelector'],
    ['retained after subtree removal', 'retainedAfterRemoval'],
  ];
  const width = Math.max(...rows.map(([label]) => label.length));
  const columns = all.map(result => result.engine);
  const columnWidth = Math.max(12, ...columns.map(name => name.length));

  console.log(
    `nwsapi memory footprint (n=${count} per measurement, ` +
      `median of ${rounds} rounds)\n`,
  );
  console.log(
    ''.padEnd(width) + '  ' + columns.map(name => name.padStart(columnWidth)).join('  '),
  );
  for (const [label, key] of rows) {
    console.log(
      label.padEnd(width) +
        '  ' +
        all.map(result => bytes(result[key]).padStart(columnWidth)).join('  '),
    );
  }
  console.log(
    '\nRetention after removal is the number to watch: a cache that keeps ' +
      'query\nplans holds kilobytes, one that keeps result sets holds the ' +
      'removed DOM.',
  );
}

main();
