# Coverage and contracts

Coverage reports measure all published JavaScript in `src`, including the engine, adapter, and optional jQuery and traversal modules. The report rejects missing or unexecuted optional modules. Optional module tests execute the generated browser scripts in isolated VM contexts with real DOM fixtures. Both `import` and `require` execute the published CommonJS bytes; Vite does not transform those files. Browser and Node engine coverage are merged, and the report requires evidence from WPT and the Node adapter suite.

The recorded run measures 99.06% statements, 95.70% branches, 98.67% functions, and 99.03% lines. Both the engine and adapter exceed 95% on every metric; the adapter and both optional modules reach 100%. The enforced floors are 98% statements, functions, and lines, and 95.1% branches. The executable `bin/nwsapi.js` has a separate 100% statement, branch, function, and line assertion using raw V8 coverage from real processes. Those processes exercise the shebang, arguments, standard output, error output, and exit status from a foreign working directory. Compiler mode and flag permutations run in process to keep the integration tier short.

Coverage merging uses the shared [report normalization practices](../../fleet/testing/practices.md#check-coverage-data-before-trusting-the-percentage). Regression tests protect repeated merges and input immutability.

Custom API regressions exercise registered selectors and operators across legacy and modern modes, cold and cached queries, DOM mutations, and callback termination. Adapter contract tests check throwing and `noexcept` behavior for all four query methods, independent fallback arrays and subject hints, and shared instances after cache clearing and synchronous mutations.

Optional module tests cover modern and legacy traversal, default and indexed navigation, every registered pseudo-class, selector composition, DOM mutations, positional resolver modes, callbacks, and invalid arguments. Browser checks load both modules after the regular and minified core and verify real layout visibility.
