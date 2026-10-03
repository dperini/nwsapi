// Usage: node scripts/benchmark-compiler.cjs [path/to/baseline.js]
// Measures warmed execution and fresh compilation. DOM creation is untimed.
const assert = require('node:assert/strict');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { JSDOM } = require('jsdom');

const cards = Array.from({ length: 150 }, (_, i) =>
  '<section class="card" id="card' + i + '">' +
  '<span class="needle"></span>'.repeat(12) + '</section>').join('');
const dom = new JSDOM('<!doctype html><main>' + cards + '</main>' +
  '<aside id="wide">' + '<i class="needle"></i>'.repeat(600) + '</aside>' +
  '<div class="outer">'.repeat(80) + '<b class="leaf" id="leaf"></b>' + '</div>'.repeat(80));
const document = dom.window.document;
const card = document.getElementById('card0');
const wide = document.getElementById('wide');
const leaf = document.getElementById('leaf');

const cases = [
  ['reject before :has', 500, engine => engine.match('article.missing:has(> .needle)', card), false],
  ['cached :has miss', 500, engine => engine.match(':has(> .missing)', card), false],
  [':has wide first hit', 100, engine => engine.match(':has(> .needle)', wide), true],
  [':has branch exit', 100, engine => engine.match(':has(> .needle, > .missing)', wide), true],
  ['ancestor early exit', 500, engine => engine.match('.outer .leaf', leaf), true],
  ['select relational', 10, engine => engine.select('.card:has(> .needle)').length, 150],
  ['first relational', 100, engine => engine.first('.card:has(> .needle)').id, 'card0'],
  ['select nested nth', 5, engine => engine.select('section > span:nth-child(2n):not(:nth-child(3n))').length, 600],
  ['forgiving invalid branch', 20, engine => engine.select('.card:is(:unknown, .card)').length, 150],
  ['logical branch control', 20, engine => engine.select('.card:is(.card, .missing)').length, 150],
  ['adjacent has hit', 500, engine => engine.match(':has(+ section.card)', card), true],
  ['adjacent has miss', 500, engine => engine.match(':has(+ .missing)', card), false],
  ['wildcard has control', 500, engine => engine.match(':has(> *)', card), true],
  ['simple match control', 3000, engine => engine.match('section.card', card), true],
  ['simple select control', 100, engine => engine.select('.card').length, 150],
];

const engines = [];
if (process.argv[2]) engines.push(['baseline', require(path.resolve(process.argv[2]))(dom.window)]);
engines.push(['current', require('../src/nwsapi.js')(dom.window)]);
const times = engines.map(() => []);
try {
  for (let c = 0; c < cases.length; c++) {
    const [name, iterations, run, expected] = cases[c];
    for (const [, engine] of engines) {
      assert.equal(run(engine), expected, name);
      for (let i = 0; i < 20; i++) run(engine);
    }
    const samples = engines.map(() => []);
    // Alternate engine order across rounds to reduce timing-order bias.
    for (let round = 0; round < 7; round++) {
      for (let offset = 0; offset < engines.length; offset++) {
        const index = (round + offset) % engines.length;
        const engine = engines[index][1];
        const start = performance.now();
        let count = 0, elapsed;
        // Very fast paths need a long enough sample to limit timer noise.
        do {
          for (let i = 0; i < iterations; i++) run(engine);
          count += iterations;
          elapsed = performance.now() - start;
        } while (elapsed < 20);
        samples[index].push(elapsed / count);
      }
    }
    samples.forEach((sample, index) => {
      sample.sort((a, b) => a - b);
      times[index][c] = sample[3];
    });
  }
  const cold = engines.map(() => []);
  for (let round = 0; round < 7; round++) {
    for (let offset = 0; offset < engines.length; offset++) {
      const index = (round + offset) % engines.length;
      const engine = engines[index][1];
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        engine.compile('section#unique' + round + '_' + i + '.card[data-active]:has(> span)', false);
      }
      cold[index].push((performance.now() - start) / 1000);
    }
  }
  cold.forEach((sample, index) => {
    sample.sort((a, b) => a - b);
    times[index][cases.length] = sample[3];
  });
  cases.push(['cold compilation']);
  console.log('Node ' + process.version + '; jsdom ' + require('jsdom/package.json').version);
  console.log('Median milliseconds per query or compilation; seven rounds, execution samples >=20ms\n');
  console.log('case'.padEnd(25) + engines.map(([label]) => label.padStart(12)).join('') +
    (engines.length > 1 ? '     speedup' : ''));
  cases.forEach(([name], c) => {
    console.log(name.padEnd(25) + times.map(time => time[c].toFixed(4).padStart(12)).join('') +
      (engines.length > 1 ? (times[0][c] / times[1][c]).toFixed(2).padStart(11) + 'x' : ''));
  });
} finally {
  dom.window.close();
}
