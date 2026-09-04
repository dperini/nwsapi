Raise CACHE_LIMIT to 4096

Sweeping the limit over three workloads, with retained heap alongside throughput, because the question is a trade rather than a maximum:
 workload 1000 2048 4096 8192 30 selectors, all hit 26.18us 26.93us 26.80us 27.27us 2000 selectors 50.75ms 50.36ms 4.12ms 4.15ms heap, cache full 2.99mb 3.86mb 6.87mb 14.05mb
 A working set that fits costs the same at any limit. One that fits 4096 and not 1000 is worth 12x. 8192 buys nothing further and doubles the worst case, which is only reached by a caller that has that many distinct selectors, since the caches grow lazily.
 The cliff sits between 2048 and 4096 for a set of 2000 selectors because a selector is not one cache entry: ':not(.x)' compiles to a run-time s.match('.x', e), so the argument takes an entry of its own. 100 such selectors leave 200 entries in the match caches, measured.
 4096 is also the value the fork of this engine inside jsdom's current selector implementation uses.
