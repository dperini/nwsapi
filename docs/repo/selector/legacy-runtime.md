# Legacy runtime support

Load runtime shims before loading the library.
Load `modules/nwsapi-legacy.js` after the core and before querying.
The module registers legacy hooks on the existing engine.
Registration enables `Config.LEGACY` for documents that need older DOM handling.
Use `NW.Dom.configure({ LEGACY: true })` to enable it explicitly.

The core uses native `Map` and `WeakMap` implementations.
The optional module checks built-in support when its hooks are registered.
When `Map` is absent, registration replaces the empty query caches with bounded legacy caches.
When `WeakMap` is absent, consumers use their existing bounded or uncached paths.
The core captures required runtime APIs once at module startup. Every engine
reuses those references. Legacy registration selects allocators from that
snapshot and captures its ES5 helpers. Later configuration changes leave
allocated resources unchanged.

Keep DOM checks scoped to their document. A runtime check cached for the
engine cannot describe differences between documents.

## JavaScript requirements

The generated core and optional browser modules use ES5 syntax. The build lowers arrow callbacks, block declarations, and object shorthand after bundling. Runtime source uses indexed loops instead of `for…of`. The `jsdom` adapter has a separate ES2019 syntax requirement.

Modern mode uses `String.prototype.includes()` through a selected helper. Legacy mode selects an `indexOf()` helper. Generated selector functions call the same helper, so they work without native `includes`. Registration enables legacy mode when the method is absent. `String.fromCodePoint()` has a fallback, and `Symbol.iterator` is optional. The internal Unicode bundle disables Rolldown's symbol metadata so module loading does not require `Symbol.toStringTag`.

`WeakRef` and `FinalizationRegistry` are optional features newer than ES2015. Their absence disables the related cache optimizations. Preserve those fallback paths when targeting older runtimes.

The build and compatibility lint share the IE11 target in `package.json`. The runtime still needs ES5 facilities such as `Object.create()`, property descriptors, JSON, and array iteration methods. Compatibility lint checks known APIs, while runtime tests remove unsupported built-ins in isolated contexts. These checks do not execute IE11 or provide browser features that its DOM lacks.

Optional native APIs use a source-pattern check adapted from [`lodash`](https://github.com/lodash/lodash/blob/4.17.21/lodash.js#L1388-L1392). It derives the pattern from `Object.prototype.hasOwnProperty` and uses a captured `Function.prototype.toString`. A function's own `toString` method cannot make an ordinary shim pass. Map probes also check the operations used by the caches, including frozen object keys.

Native-source detection is a heuristic. Proxies, bound functions, or a previously patched `Function.prototype.toString` can conceal an implementation. The check does not prove garbage-collection behavior. Ordinary JavaScript weak-reference shims are rejected, so they cannot enable caches that require weak ownership. Missing or rejected implementations use the legacy module's bounded caches or the existing uncached paths.

## Adding capabilities

- Put detection and fallback implementations in the legacy module.
- Use native implementations when available, including in legacy mode.
- Define the fallback behavior and preserve resource lifetimes.
- Test both modes, missing or incompatible capabilities, and reuse without
  repeated detection.

The module receives the captured `WeakMapCtor` during registration.
Its `createWeakMap()` hook returns a map when available
or `undefined` for the consumer to handle. Consumers must bound their
fallbacks to avoid retaining unused documents.

## Tests

Use Node.js 26 and pnpm ≥ 12.3.4:

```sh
pnpm run test:unit test/repo/unit/legacy-runtime.test.mts
```
