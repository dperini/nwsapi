# nwsapi benchmarks

This directory is the Node.js port of the legacy browser benchmark harness
that lived in `test/speed` (Benchmark.js v1.0.0 driving fresh iframes). The
same nine selector preset groups are preserved verbatim in
[`presets.mjs`](./presets.mjs), and the same fixture page is used:
`test/speed/example/selectors.html`, a saved copy of the W3C Selectors
Level 4 spec page (~413 KB of real-world markup).

## What is compared

For every `(preset, selector)` pair, one [mitata](https://github.com/evanwashere/mitata)
group times two engines against the same shared jsdom document:

- **nwsapi** — `NW.select(selector, document)` using `src/nwsapi.js` from
  this checkout.
- **jsdom qsa** — `document.querySelectorAll(selector)`.

> **Note:** jsdom 30 does **not** use nwsapi internally — it resolves
> selectors with `@asamuzakjp/dom-selector`. That makes `querySelectorAll`
> a genuine second engine, not nwsapi benchmarking itself.

Like the old harness, each selector gets a one-shot correctness probe
before timing: the number of elements returned by each engine is compared,
and any mismatch or thrown error is collected into a
`result mismatches / errors` table printed after the run (the old harness's
yellow/FAILED highlighting). Selectors that throw in **both** engines are
skipped from timing with a note; if only one engine throws, the pair is
still timed so the healthy engine gets a score and mitata reports the other
as an error.

A single JSDOM instance (and a single nwsapi instance bound to it) is shared
by the whole process. See the comment in `selectors.bench.mjs` for the
cache-warm tradeoff: this matches the steady-state numbers the old
iframe-based harness effectively measured, but hides per-selector
cold-start (first parse/compile) costs.

## Usage

```sh
# everything (all 9 presets, ~200 selectors -- takes several minutes)
pnpm run bench

# list preset names and selector counts
pnpm run bench -- --list

# one preset group
pnpm run bench -- --preset default

# several presets (repeat the flag or comma-separate)
pnpm run bench -- --preset descendants_only,comma-separated_group_or_selector_list

# a single selector (substring match against the preset selectors)
pnpm run bench -- --selector 'div:not(.example)'

# selectors matching a regular expression
pnpm run bench -- --selector '/^div:nth-child/'

# machine-readable output
pnpm run bench -- --json > results.json 2> issues.json
```

The `--` separator is optional with pnpm — it forwards unrecognized flags
after the script name either way, so both `pnpm run bench -- --list` and
`pnpm run bench --list` work. The script can also be run directly:
`node bench/selectors.bench.mjs --list`.

With `--json`, mitata's JSON results go to **stdout** while the
mismatch/error records are emitted as JSON on **stderr**, so stdout stays
parseable.

## Caveats

- The two `negation_tree-structural*` preset groups largely exercise
  nwsapi's **error path** today: nwsapi cannot parse `:not()` with nested
  functional pseudo-classes such as `div:not(:nth-child(2n))` (a
  pre-existing engine limitation), so most selectors in those groups throw
  in nwsapi while jsdom resolves them. The mismatch/error table after the
  run reports them; treat those timings as error-handling throughput, not
  selector-matching speed.

## Tips

- Running node with `--expose-gc` improves mitata's output quality: it lets
  mitata trigger garbage collection between samples and report per-iteration
  heap statistics.

  ```sh
  node --expose-gc bench/selectors.bench.mjs --preset default
  ```

- A full run across all presets is long; use `--preset`/`--selector` to
  narrow the run while iterating on engine changes.
