# Coverage and contracts

Coverage reports measure the generated engine, adapter, and optional jQuery, legacy, and traversal modules under `dist/`. Package staging places these files under the published `src/` paths. The report rejects missing or unexecuted optional modules. Optional module tests execute the generated scripts in isolated VM contexts with real DOM fixtures. Both `import` and `require` execute the generated CommonJS bytes. Browser coverage combines the modern and forced-legacy WPT runs before merging Node coverage. The report requires evidence from WPT and the Node adapter suite.

The recorded run measures 98.75% statements, 95.33% branches, 99.28% functions, and 98.72% lines. The adapter, jQuery module, and traversal module reach 100%. The legacy module measures 95.50% statements, 83.40% branches, 98.07% functions, and 95.13% lines. The enforced aggregate floors remain 98% statements, functions, and lines, and 95.1% branches.

The executable `dist/bin/nwsapi.js`, published as `bin/nwsapi.js`, has a separate 100% assertion for every execution metric. Raw V8 coverage comes from real processes. Those processes exercise the shebang, arguments, standard output, error output, and exit status from a foreign working directory. Compiler mode and flag permutations run in process to keep the integration tier short.

The accumulated report also records TypeScript identifier coverage at 96.24%. Type coverage and execution coverage have separate totals and denominators. The report does not average their percentages.

Coverage merging uses the shared [report normalization practices](../../fleet/testing/practices.md#check-coverage-data-before-trusting-the-percentage). Regression tests protect repeated merges and input immutability.

Custom API regressions exercise registered selectors and operators across legacy and modern modes, cold and cached queries, DOM mutations, and callback termination. Adapter contract tests check throwing and `noexcept` behavior for all four query methods, independent fallback arrays and subject hints, and shared instances after cache clearing and synchronous mutations.

Optional module tests cover modern and legacy traversal, default and indexed navigation, every registered pseudo-class, selector composition, DOM mutations, positional resolver modes, callbacks, and invalid arguments. Legacy hook tests verify registration, engine identity, separate frame installation, and missing built-ins. Browser checks load the optional modules after the core and verify real layout visibility in a separate suite.
