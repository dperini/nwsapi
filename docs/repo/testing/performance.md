# Test performance

Follow the shared [budget recovery steps](../../fleet/testing/performance.md) and the `writing-fast-tests` skill when a test lane exceeds its limit. This document records the commands and measurements specific to `nwsapi`.

## Reproduce the unit measurement

Run the ordinary command with coverage enabled:

```sh
pnpm run test:unit --coverage
```

This invokes `scripts/repo/run.mts` and `scripts/repo/test.mts`. The wrapper disables Node's compile cache for precise V8 coverage. The unit lane uses two thread workers. Its 10s budget includes the build, runner startup, tests, and coverage reporting.

For a focused investigation, append test paths to the same command. Vitest's `--reporter=json` and `--outputFile` options can retain individual test timings and coverage maps in an owned directory under `os.tmpdir()`. Keep the complete lane measurement as the evidence for meeting its budget.

## Remove repeated setup and parsing

The attribute-string tests use one `jsdom` window to parse an unchanged fixture. Each test clones the document and creates its own engine. Attribute changes and compiled-selector caches remain private to that case. The suite closes the shared window after all cases finish. Tests that need window state or browser APIs retain their own fixtures.

The API documentation generator searches the parsed code tree until it reaches the engine factory or adapter class. It no longer collects every descendant before finding those nodes. Documentation tests read unchanged inputs and render their common output once. Cases that change the source still parse and validate that changed input.

## Measured result

The comparison used Node 26.5.0, `vitest` 5.0.0, and macOS 26.6.2 on an Apple M3 Max with 36GiB of memory. Both sequential runs used the full unit lane with coverage, two thread workers, and the Node compile cache disabled. The baseline was commit `92ebae1`. Both runs selected the same 67 files and passed the same 629 tests.

| Measurement | Before | After | Change |
| --- | ---: | ---: | ---: |
| Budgeted unit process | 6124ms | 5060ms | 17.4% lower |
| Reported maximum RSS | 1651.8MiB | 1498.1MiB | 9.3% lower |

The runner supplied the elapsed times. `/usr/bin/time -l` supplied maximum RSS. These are local measurements from one pair of complete runs. They do not establish the same improvement on every CI machine. The coverage file list, statement maps, function maps, branch maps, and covered entries matched between runs. The comparison covers the unit lane. CI merges additional suites before enforcing the final coverage thresholds.

Focused CPU profiles covered 198 tests across the same four files before and after the change. They captured the coordinator, both test workers, and the build subprocess. Aggregate sampled self-time in the API generator fell from 190ms to 15ms. Generated `jsdom` interface code fell from 455ms to 118ms. These samples span parallel workers and must not be added together as elapsed time.

The attribute cases also pass with shuffled execution using seed 9173:

```sh
pnpm run test:unit test/repo/unit/attribute-parse-error.test.mts \
  --sequence.shuffle --sequence.seed=9173
```
