# Build design

Authoring files live in `src/`. `pnpm run build` writes generated JavaScript to `dist/`. The `.js` loaders and `.d.ts` declarations in `src/external/` are authored files. The build bundles those loaders into the matching `dist/external/` paths.

The build entry point is `scripts/repo/build/run.mts`. Its post-build work starts in `scripts/repo/build/post.mts`, with individual transforms under `scripts/repo/build/post/`. The engine bundling helper lives in `scripts/repo/rolldown/engine.mts`. Rolldown plugins live in `.config/repo/rolldown/`.

## Readable output

The build keeps the CommonJS, AMD, and browser wrapper intact. It bundles the engine factory inside that wrapper so unused code can be removed without changing how the library loads. Output stays readable and is not minified.

Unicode directionality includes the three required Unicode 17 bidirectional classes. Their regular expressions are inlined without a custom encoding or decoder. External CommonJS bundles also receive an unreachable export annotation so Node.js can recognize their named exports during ESM imports.

`pnpm run check:unicode-es5` validates the three expressions selected by `src/external/unicode.js`. It rejects flags, modern escapes, and regex syntax that ES5 cannot parse. Both `pnpm run check` and the build run this check, so dependency updates cannot silently introduce incompatible table syntax.

After bundling, `@swc/core` lowers the browser core and modules to ES5 syntax. The target comes from the IE11 Browserslist entry in `package.json`. An `acorn` parse rejects newer syntax in these outputs. The transform preserves native `typeof` and `instanceof` operations and does not add symbol polyfills or callback names. The Node.js adapter and command-line tools keep their separate syntax targets.

After the transforms, `scripts/repo/build/post/format.mts` formats generated JavaScript with `oxfmt`. The settings in `.config/build.config.mts` use tabs and a 160-character wrap target to reduce indentation overhead while keeping the code readable. Trailing commas are disabled, and browser files are parsed as ES5 again after formatting. The formatter also runs after export annotations and the license banner are added.

## Legacy hooks

`dist/nwsapi.js` contains the selector engine and its hook points. `dist/modules/nwsapi-legacy.js` contains the older DOM implementations. It registers them through `NW.Dom.registerLegacyHooks()` and keeps the existing engine object and selector extensions.

The hooks cover document detection, attribute and tree readers, candidate lookup, sibling enumeration, cache allocation, native matcher aliases, resolver rewriting, and iframe setup. Each engine owns its hooks. Reader functions are selected when the document or configuration changes, and resolver rewriting runs during compilation.

The core captures selected runtime APIs once at module startup and shares them across engine instances. Legacy registration receives that snapshot when choosing cache allocators and string helpers. Install runtime shims before loading the library. The [runtime contract](../selector/legacy-runtime.md) explains the native-source checks and their limits.

Load the optional module after the core and before querying. Registration detects missing runtime and DOM capabilities. `configure({ LEGACY: true })` can force that behavior after registration. The flag also selects a string-search helper, including for generated selectors. Modern mode uses `String.prototype.includes()`. Legacy mode uses `indexOf()`.

Every build parses both outputs with `scripts/repo/check/legacy-hooks.mts`. The check rejects legacy implementations in the core and a copied selector engine in the optional module.

Oxlint loads `eslint-plugin-compat` with JavaScript built-in checks enabled. It uses the same IE11 target. A repository plugin rejects `for…of` in runtime source. Integration tests parse generated resolvers as ES5 and run compatibility lint on them in a temporary directory. Static lint has limits when it cannot infer a receiver's type or follow a feature check across functions. Isolated runtime tests cover the missing built-ins as well.

## Package layout

Run `pnpm run package` to build and pack the library. `scripts/repo/build/package.mts` creates a staging directory under `os.tmpdir()`, copies the declared outputs, and runs the package manager there. It removes the staging directory when packing finishes. The tarball goes to `dist/` by default.

The mapping in `.config/build.config.mts` preserves the published `src/nwsapi.js`, `src/dom-selector.js`, and `src/modules/` paths. It also places the executable at `bin/nwsapi.js`. The staging step parses generated JavaScript and adjusts relative module references for those published paths. Local files remain runnable under `dist/`.

Direct packing from the repository is rejected because it bypasses this mapping. Package tests install the staged tarball into a separate temporary project, check its file list, run its executable, and exercise the `jsdom` adapter.

## Authored sources and local outputs

Engine code lives in `src/core/`. Its Unicode fallback lives in `src/core/unicode/`. `text-direction.mts` finds the first character with a strong Unicode direction. `dom.mts` handles DOM boundaries, and `directionality.mts` resolves inherited and automatic direction. The adapter and validated `jsdom` readers live in `src/adapter/`. The build bundles `jsdom/readers.mts` into the existing adapter output. Optional selector extensions live in `src/extension/`. External loaders keep their matching JavaScript and declaration files in `src/external/`.

The local build emits the core at `dist/nwsapi.js`, the adapter at `dist/adapter/dom-selector.js`, and optional extensions under `dist/modules/`. The adapter stays separate so browser consumers do not load its code. The CommonJS factory loads it lazily through the `DOMSelector` export used by the `jsdom` override.

The CLI entry at `src/bin/nwsapi.mts` and its implementation are bundled together as `dist/bin/nwsapi.js`. There is no separate `cli.js` runtime dependency. The packed executable remains `bin/nwsapi.js`, and its help works without repository sources or optional peers. Packing translates relative module references to the published file mapping.

The shared complexity rule in `.config/fleet/oxlint/complexity.json` limits function complexity to 15. The rule also checks the core compiler and legacy extension. The ported `nwsapi/max-file-lines` rule requires splitting modules above 500 lines and applies a hard cap of 1,000 lines. Existing violations remain visible as lint errors.

## Engine module boundaries

`src/core/nwsapi.mts` owns the loading wrapper and captured runtime APIs. `factory.mts` creates one engine state object and initializes its readers, caches, and public methods. Each engine keeps its own state. Query results and DOM references are not shared between documents through a module singleton.

`compile.mts` prepares a resolver and its cleanup. `compile-selector.mts` walks the selector, while `compile-token.mts` dispatches tokens to their handlers. Attribute, combinator, and pseudo-class handlers have separate modules. Positional helpers separate formula parsing from the code emitted for individual matches, ordered selections, and shared sibling indexes. Their working state belongs to one compilation.

The first-match shortcuts live in `first-simple.mts`. General first-match resolution lives in `first.mts`. The sibling-cache factories live in `create-nth-element.mts` and `create-nth-of-type.mts`. Their caches retain the existing query cleanup behavior. Legacy attribute handling lives in `src/extension/legacy/attributes.mts` and is bundled into the optional legacy module.

The build inlines these source modules into the existing distribution files. Consumers do not need to load the source modules separately. API documentation follows parsed declarations and bound engine methods to link to their defining modules.
