# Adaptive ancestor filtering

A selector with an ancestor walk and at least two required ancestor tags can
reject candidates using a bitmask before running the full matcher. Hash
collisions admit extra candidates; they cannot reject a valid match.
Direct child chains and legacy mode bypass this filter.

Each filtered resolver owns three counters: `seen`, `kept`, and `rest`. After
64 samples, retaining at least 48 candidates disables filtering for the next
4096 candidates. Sampling then resumes. A bypass still runs the full matcher;
the counters never substitute for a query result.

Counters belong to the compiled resolver, not an ever-growing indexed array.
Evicting that resolver releases its state when callers hold no other reference
to it. DOM summaries are separate and cleared after every filtered invocation,
including when a callback throws. Mutations and document changes therefore
cannot reuse summaries from a previous invocation.

## Validation

Run with Node.js ≥ 22, using a jsdom-supported patch: 22.22.2+, 24.15.0+, or 26+.

```sh
pnpm install
pnpm run test:ancestor
```

Tests cover sample/bypass/retry transitions, isolated resolver state, cache
eviction, movement, document changes, legacy bypass, and exception cleanup.
The adaptive thresholds are retained from #167. No new speedup is claimed
without representative benchmarks.
