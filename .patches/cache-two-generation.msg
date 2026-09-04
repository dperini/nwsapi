Evict from the resolver caches without Map.delete

A strict LRU reorders on use and evicts one entry per insertion, both with Map.delete, and V8 keeps a deleted entry in the backing store until the map rehashes — so keys().next(), the way the oldest entry is found, walks the tombstones every earlier eviction left. Profiling 8000 selectors cycling through a 4096-entry cache put Map.set at 28% of total run time.
 Entries are now written to a young generation. When it fills, it becomes the old generation and the previous old one is dropped whole: no per-insertion delete, no iteration, and eviction is a pointer swap. A hit in the old generation carries the entry back, so anything still in use survives the next swap. Capacity is unchanged, half the limit per generation.
 get() also stops calling has() first. A cached value is never undefined, so one lookup answers both whether the entry exists and what it holds.
 Measured with both builds in one process, matching a sweep of distinct selectors against one element:
 30 selectors, all hit 3.13us 4.68us 1.50x 2000 selectors 732us 690us 0.94x 3000 selectors 973us 22.72ms 23.34x 8000 selectors 34.86ms 67.60ms 1.94x
 The loss is a working set that straddles a generation: it no longer fits the young one, so a pass takes old-generation hits and pays to carry them across. At 3000 the comparison inverts, because a selector is not one cache entry — a ':not()' argument takes its own — so 3000 selectors overflow a 4096-entry LRU while the segmented cache degrades instead of thrashing.
