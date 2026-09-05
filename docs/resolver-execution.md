# Resolver execution

This extraction preserves execution work from #167 without its parser,
legacy-DOM, attribute-equality, or ancestor-filter changes.

Candidate loops stop at the collection length instead of reading one element
beyond it. Both array and `item()` modes return the original candidates in
order. The item-mode header initializes its result index; its tail continues
the loop rather than replacing the result array with a boolean.

When a lookup already answers a selector, compilation caches `null` instead
of a copying resolver. Collection assembly appends those candidates directly.
Compiled-cache keys include collection mode and callback presence, so a cached
no-op cannot suppress a later callback or supply the wrong loop shape.

Cached plans fetch candidates directly instead of allocating lookup closures.
Matching caches hold resolver arrays without an extra wrapper object. Array
slicing uses captured intrinsics, including installed query wrappers.

Tag tests run before the remaining tests of their compound selector. Each
combinator closes that compound before traversal changes the current element.
The attribute-equality optimization remains separate.

## Validation

Run with Node.js ≥ 22, using a jsdom-supported patch: 22.22.2+, 24.15.0+, or 26+.

```sh
pnpm install
pnpm run test:resolver
```

Tests cover cold and cached results, escaped classes, mutations, callbacks,
matching, cache turnover, tag-read ordering, installed wrappers, and both
collection modes. This change makes no new benchmark claim; performance still
needs measurement on the combined branch and representative hosts.
