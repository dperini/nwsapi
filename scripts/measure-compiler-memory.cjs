// Usage: node scripts/measure-compiler-memory.cjs baseline.js [report.json]
// Each source runs in a fresh process. Allocation sampling is an estimate,
// including collected objects, not a count of every JavaScript allocation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.argv[2] !== '--worker') {
  assert.ok(process.argv[2], 'provide a saved baseline source file');
  const reports = [];
  for (const [label, file] of [['baseline', process.argv[2]], ['current', path.join(__dirname, '../src/nwsapi.js')]]) {
    const child = spawnSync(process.execPath, ['--expose-gc', __filename, '--worker', path.resolve(file)], { encoding: 'utf8', timeout: 60000 });
    assert.equal(child.status, 0, child.stderr);
    reports.push({ label, ...JSON.parse(child.stdout) });
  }
  const report = { date: new Date().toISOString(), node: process.version, reports };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
} else {
  (async () => {
    const { JSDOM } = require('jsdom');
    const inspector = require('node:inspector');
    const { promisify } = require('node:util');
    const { createHash } = require('node:crypto');
    const source = process.argv[3];
    const dom = new JSDOM('<!doctype html><main>' + '<section class="card"><i class="needle"></i></section>'.repeat(150) + '</main>');
    const engine = require(source)(dom.window), document = dom.window.document;
    async function collect() {
      for (let i = 0; i < 4; i++) { await new Promise(setImmediate); global.gc(); }
      return process.memoryUsage().heapUsed;
    }
    for (let i = 0; i < 100; i++) engine.select('.card:has(.needle)');
    engine.configure({}, true);
    const initialHeap = await collect();
    // Ordinary generated selectors, with moderately long literal attributes,
    // exercise the byte limit before the traditional 1,000-entry limit.
    for (let i = 0; i < 1800; i++) engine.compile('section[data-key="' + i + '_' + 'value'.repeat(160) + '"]:not(.off)', false);
    const retainedAfterCacheFill = (await collect()) - initialHeap;
    const caches = {};
    for (const name of ['matchLambdas', 'selectLambdas', 'matchResolvers', 'selectResolvers']) {
      const cache = engine[name];
      if (cache && cache.size) caches[name] = { entries: cache.size(), estimatedBytes: cache.bytes ? cache.bytes() : null, byteLimit: cache.byteLimit ? cache.byteLimit() : null };
    }
    engine.configure({}, true);
    const retainedAfterClear = (await collect()) - initialHeap;
    let weak;
    (() => {
      const detached = document.createElement('aside');
      detached.innerHTML = '<i class="gone"></i>'.repeat(1000);
      weak = new WeakRef(detached);
      assert.equal(engine.select('.gone', detached).length, 1000);
      engine.first('main', document); // release the active context, keep caches
    })();
    await collect();
    const detachedContextRetained = !!weak.deref();
    for (let i = 0; i < 100; i++) engine.select('.card:has(.needle)');
    await collect();
    const session = new inspector.Session(); session.connect();
    const post = promisify(session.post).bind(session);
    await post('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    let checksum = 0;
    const iterations = 3000;
    for (let i = 0; i < iterations; i++) checksum += engine.select('.card:has(.needle)').length;
    assert.equal(checksum, iterations * 150);
    const { profile } = await post('HeapProfiler.stopSampling');
    let allocated = 0;
    function sum(node) { allocated += node.selfSize; for (const child of node.children) sum(child); }
    sum(profile.head); session.disconnect();
    console.log(JSON.stringify({ source, sha256: createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
      initialHeap, retainedAfterCacheFill, retainedAfterClear, caches, detachedContextRetained,
      sampledAllocatedBytes: allocated, queries: iterations, sampledBytesPerQuery: allocated / iterations }));
    dom.window.close();
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
