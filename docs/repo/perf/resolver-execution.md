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
Matching-cache keys also distinguish calls with and without callbacks.

Cached plans fetch candidates directly instead of allocating lookup closures.
Matching caches hold resolver arrays without an extra wrapper object. Array
slicing uses captured intrinsics, including installed query wrappers.

Tag tests run before the remaining tests of their compound selector. Each
combinator closes that compound before traversal changes the current element.
The attribute-equality optimization remains separate.

## Validation

Run with Node.js 26.

```sh
pnpm install
pnpm run test:unit
```

Tests cover cold and cached results, escaped classes, mutations, callbacks,
matching, cache turnover, tag-read ordering, installed wrappers, and both
collection modes. This change makes no new benchmark claim; performance still
needs measurement on the combined branch and representative hosts.

## Query-local ancestor results

The compiler can reuse the previous ancestor-search result when consecutive candidates start that search at the same element. It emits two local variables into the resolver. The variables reset on every call, and the existing positional caches keep their query-level cleanup. No map, per-element record, or extra parent read is needed.

Eligibility uses the existing selector tokens and requires one descendant walk. Classes, IDs, ordinary type selectors, the universal selector, standard combinators, and supported static structural pseudos can qualify. Attributes, namespaces, filtered positional selectors, logical and dynamic pseudos, relative selectors, callbacks, and legacy mode use the existing matcher. Registered selector or combinator extensions also disable this optimization when compiling a new resolver.

The eligibility pass does not report syntax errors. The normal parser remains responsible for validation. Both array and `item()` collection modes retain candidate order. Tests check cache hits and misses, mutations between calls, sibling moves, callback mutations, and legacy behavior. See the [integration measurements](journal.md#integrate-ancestor-reuse-into-the-compiler).

Modern collection resolvers initialize class-test regular expressions once per query. The compiler deduplicates identical expressions within that resolver and emits local variables for them. These expressions use no global or sticky flag, so repeated tests do not advance `lastIndex`. Class-name values remain live reads, and nested callback queries receive their own expression objects. Matching one element and legacy collection resolvers retain their existing expressions. Nested compiler calls that do not share the collection's compiler state also retain their existing expressions.
