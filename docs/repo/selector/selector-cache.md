# Selector caching

`nwsapi` v3 retains compiled selector plans so repeated queries can reuse the
work of parsing and compilation. Cache misses still compile and execute the
selector. Retention affects performance, not which elements match.

## Defaults and configuration

Start with the defaults. Increase a budget only after measuring the host's
query workload and memory use.

| Option | Default | Scope |
| --- | ---: | --- |
| `CACHE_LIMIT` | `4096` | Entry limit for caches using the configurable entry budget. |
| `CACHE_BYTES` | `2 * 1024 * 1024` (2MiB) | Estimated retained bytes per compiled-plan cache. |

Both values must be nonnegative safe integers. Zero disables retention for the
applicable caches. Invalid values throw a `TypeError` before options change.
Changing either budget clears the existing query caches and applies immediately.
Avoid changing budgets on every query.

For a large stylesheet, a host can allow more retention:

```js
engine.configure({ CACHE_LIMIT: 8192, CACHE_BYTES: 8 * 1024 * 1024 })
```

Configure the engine the host actually uses. Changing a separate factory instance
does not configure the engine inside `jsdom`. With the v3 adapter, call
`DOMSelector.configure(window, options)` before its first use. See the
[API reference](api.md#configuration) for the full configuration interface.

## What stays in the cache

Compiled-plan caches use least recently used ordering. A hit moves an entry to
the most recent position. A new plan that fits without eviction is retained
immediately.

When a new plan requires eviction, a local deterministic sequence admits
approximately one in eight such insertions. An admitted plan evicts the oldest
entries only until it fits. A rejected plan still executes, without displacing
resident entries. This keeps a useful subset during repeated scans larger than
the cache. Overflow does not clear the whole compiled-plan cache.

A plan larger than the byte budget is used without being retained. The byte
estimate includes keys, generated code, bound subplans, and metadata. It is
per cache, not a bound on total JavaScript heap or native code memory. Several
caches can retain plans at once. Fixed-size helper caches keep their own bounds
and policies. The fallback for hosts without `Map` preserves the compiled-plan
policy through a prefixed dictionary.

## Tradeoffs and evidence

Sampled admission reduces recompilation during oversized steady scans. It can
take longer to populate a newly changed working set, and some small warm
workloads can be slower. Increasing budgets can improve reuse while retaining
more memory. Neither policy nor larger budgets eliminate all misses.

The [recorded comparison](../../../assets/repo/bench/cache-admission/2026-10-08.md)
illustrates these tradeoffs across simple selectors, complex selectors, frequent
queries mixed with one-off queries, and a changing stylesheet. It measures
complete `match()` calls and estimated retention. Use those cases as a starting
point for measuring your own host's workload and memory use.
