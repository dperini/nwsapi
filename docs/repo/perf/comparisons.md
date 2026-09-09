# Compare engine builds with `mitata`

Use the harnesses in `scripts/repo/bench/compare/` to compare two saved engine builds. Both variants use the same fixture, measurement code, and installed dependencies within each runtime. Node uses `jsdom`. Chromium uses its native DOM. Compare variants within a runtime, and report Node and browser results separately.

The repository pins `mitata` through the dependency catalog. Existing selector and cache benchmarks already use it. The earlier `result-arrays` experiments used custom timing loops. Their records remain useful historical evidence, but their measurement settings differ from these harnesses.

## Run the four comparisons

Save the baseline build under `os.tmpdir()` before changing the source. Build the candidate into `dist/`. Supply absolute paths for saved builds. The examples use `/tmp/before.cjs` as a placeholder for that saved baseline.

```sh
node scripts/repo/bench/compare/node.mts --baseline /tmp/before.cjs --output assets/repo/bench/comparison-node-timing.json
node scripts/repo/bench/compare/browser.mts --baseline /tmp/before.cjs --output assets/repo/bench/comparison-browser-timing.json
node --expose-gc scripts/repo/bench/compare/node.mts --baseline /tmp/before.cjs --mode memory --output assets/repo/bench/comparison-node-memory.json
node scripts/repo/bench/compare/browser.mts --baseline /tmp/before.cjs --mode memory --output assets/repo/bench/comparison-browser-memory.json
```

Run these commands serially. Timing and memory probes belong in separate processes because heap reads, forced collections, and allocation sampling change the workload. Browser memory mode enables exposed GC and precise heap information only for that run. All browser resources are served through local Playwright routes, without fetching a benchmark dependency from a CDN.

| Option | Purpose | Default |
| --- | --- | --- |
| `--candidate` | Select the changed build. | `dist/nwsapi.js` |
| `--groups` | Set the number of interleaved selector groups. | `4` |
| `--matches` | Choose comma-separated match counts. | `0,1,16,256` |
| `--layout` | Use `adjacent`, `separated`, or `nested` elements. | `adjacent` |
| `--rounds` | Rotate baseline and candidate order across rounds. | `5` |
| `--milliseconds` | Set the requested minimum measured time per timing round. | `50` |
| `--batch` | Set the number of queries in each timed sample. | `64` |

Every fixture has 256 `p` elements. The separated layout places text and comments between elements. The nested layout gives each element a separate parent. Each match count includes a single-class control and a grouped selector that returns the same ordered nodes. Correctness is checked before and after measurement. A wrong identity, order, or duplicate fails the run.

## Understand timing results

The shared `timing.mts` module calls `mitata.measure()`. The browser bundles that module against the same installed `mitata` implementation used by Node. It enables cross-origin isolation and verifies it before measuring. This gives Chromium access to finer timer resolution. Reports include engine hashes, the `mitata` version and implementation hash, runtime versions, host details, the shared harness source hash, settings, and individual samples.

Each query receives 1000 warmup calls before measurement. `mitata` also performs its own warmup. Explicit query batches amortize timer overhead, and `do_not_optimize()` consumes the batch result. Automatic batching is disabled through a negative batch threshold, including when a coarse timer reports zero elapsed time. Baseline and candidate order rotates across rounds. Timing mode disables manual GC and heap probes. Each round requests at least 12 samples and the selected duration, with a cap of 100000 samples.

All samples are retained without trimming. `mitata` returns them in sorted order, so their array order does not show when a scheduling pause happened. Times are reported in nanoseconds per query. The p50 and p99 values describe batch-averaged query costs. They are not individual-query tail latencies. Use the samples and repeated runs to judge variation rather than treating one median as an exact speed difference. For very fast browser operations, increase `--batch` and repeat. Timer quantization can hide or exaggerate small changes even with cross-origin isolation.

[`mitata`'s documentation](https://github.com/evanwashere/mitata#readme) describes parameterized benchmarks, computed setup, summaries, distributions, GC controls, and optional hardware counters. Computed setup can help with future cold or mutation benchmarks. Hardware counters require additional platform support and are not enabled by these harnesses. These harnesses focus on warm queries over unchanged documents.

## Understand the memory reports

Memory mode records three different measurements. They answer different questions.

| Measurement | What it tells us | Limit |
| --- | --- | --- |
| `mitata` heap deltas | How much the observed JavaScript heap grows across a query batch. | Negative deltas are excluded, and collections during a batch can change the estimate. |
| V8 allocation sampling | An estimate of allocation traffic over 2000 calls, including objects later collected. | Sampling is approximate and does not include all native DOM storage. |
| Heap after forced GC | How whole-process or whole-page JavaScript heap usage changes after repeated calls. | It is not a per-object retention graph or proof that detached nodes are released. |

`mitata` memory probes use 12 samples per round and force GC before and after batches. Node provides `v8.getHeapStatistics().used_heap_size`. Chromium provides `performance.memory.usedJSHeapSize` with precise memory information enabled. The [measurement implementation](https://github.com/evanwashere/mitata/blob/master/src/lib.mjs) explains why heap growth estimates exclude negative deltas. Do not label these estimates as total bytes allocated or retained bytes.

The `heapDeltaBytes` average, minimum, and maximum are normalized per query. Its total remains the sum of observed positive batch deltas for the round. `gcNs` preserves `mitata`'s GC statistics without dividing them by the query count. Missing or non-finite heap estimates must not be interpreted as zero allocation. Timing values collected in memory mode include a different GC regime and should not be used for speed claims.

The V8 profiler runs after the `mitata` probe, outside its timers. Node uses an inspector session. Chromium uses a Playwright CDP session. Both include collected objects, sample at 1024byte intervals, rotate three rounds, and record allocation sites. Four forced collections precede each retained-heap reading. The reports include readings before queries, after 2000 calls, and after another 2000 calls. Fixtures remain mounted during these measurements. Use the existing heap-snapshot and detached-node tools when investigating retained objects after fixture removal.

## Keep reports reproducible

Use `--baseline` and `--candidate` with the same path for a control run. That measures harness variation without an engine change. Keep those controls separate from actual before-and-after reports. Use the same command options for comparisons you intend to discuss together.

Store generated reports under `assets/repo/bench/` and record conclusions in the performance journal. Preserve noisy and unfavorable results. Changing the harness, timer isolation, GC mode, fixture, or batch size starts a new comparison series. Do not silently replace older custom-loop measurements with `mitata` values on existing charts.
