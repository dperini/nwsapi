# Legacy runtime support

`Config.LEGACY` defaults to `false`. Enable it before querying with
`NW.Dom.configure({ LEGACY: true })`. The DOM compatibility layer can also
enable it for documents that need legacy handling.

Runtime helpers select an implementation on first use. Modern mode uses the
native capability. Legacy mode checks support once, then uses the native
implementation or a fallback. Each engine instance reuses that selection.
Later configuration changes leave initialized helpers and existing resources
unchanged.

Keep DOM checks scoped to their document. A runtime check cached for the
engine cannot describe differences between documents.

## Adding capabilities

- Put detection in the helper's legacy initialization path.
- Use native implementations when available, including in legacy mode.
- Define the fallback behavior and preserve resource lifetimes.
- Test both modes, missing or incompatible capabilities, and reuse without
  repeated detection.

`createWeakMap()` is the first helper. Legacy mode checks
`typeof WeakMap == 'function'` once. It returns a native map when available
or `undefined` for the consumer to handle. Consumers must bound their
fallbacks to avoid retaining unused documents.

## Tests

Use Node.js 18 or newer:

```sh
node --test test/legacy-runtime.test.cjs
```
