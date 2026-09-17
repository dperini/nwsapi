# Style configuration

Use the [repository practices](practices.md) for everyday commands and conventions.

The authoring settings in `.config/oxfmt.json` match Wheelhouse's base formatter profile. The extension override preserves property quoting because these scripts retain their registration format. Distribution formatting stays in `.config/build.config.mts`, where the measured file-size choices are documented.

The base `oxlint` profile carries Wheelhouse's braces rule and complexity limit of 15. Complexity applies to every authored module, including the core compiler and legacy extension. The file-wide complexity exclusions have been removed.

## Ported custom rules

The following rules are adapted from `socket-wheelhouse/template/base/universal/.config/fleet/oxlint-plugin/`. They run through the repository's existing `nwsapi` plugin during `pnpm run check`.

| Wheelhouse rule                     | Local rule                          | Purpose                                                                       |
| ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `socket/max-file-lines`             | `nwsapi/max-file-lines`             | Reports modules above 500 lines, with a 1,000-line hard cap.                  |
| `socket/max-comment-block-lines`    | `nwsapi/max-comment-block-lines`    | Reports oversized inline and documentation comments.                          |
| `socket/no-comment-glob-star-slash` | `nwsapi/no-comment-glob-star-slash` | Fixes escaped glob text that formatting could turn into a comment terminator. |
| `socket/no-process-chdir`           | `nwsapi/no-process-chdir`           | Requires explicit working directories outside tests.                          |
| `socket/no-minified-bundler-output` | `nwsapi/no-minified-bundler-output` | Rejects minification and bundled source-map output.                           |

The ports use the installed `oxlint` AST types. They do not add a Socket library dependency. Standard local `oxlint-disable-next-line` comments remain available for a specific rule with a reason. Wheelhouse's custom bypass and mirror-marker infrastructure is not imported.

`nwsapi/no-map-async-callback` rejects discarded async map results for array literals and bindings initialized from array literals. Unknown receivers and reassigned bindings stay outside this syntax-based check. Awaited, returned, and assigned results remain valid.

`nwsapi/no-spawnsync-code-property` rejects `.code` and `['code']` on recognized `spawnSync` results. Node exposes the exit status as `.status`. The rule respects shadowed bindings and leaves reassigned values alone. Neither rule adds a Socket library dependency.

## Other rules reviewed

Socket API tokens, private registry conventions, Socket library import preferences, fleet workflow names, and Wheelhouse-generated file ownership do not apply here. They are not enabled.

The source-content test rule is relevant, but porting it requires migrating the remaining document and source assertions. The shared practice prohibits new instances now. This pass does not claim that existing assertions are all migrated or that the prohibition is lint-enforced. The broader prose vocabulary rules also depend on Wheelhouse's hook pattern libraries. Their writing guidance is imported, but their hook runtime is not.

The audit does not replace the existing ES5 compatibility checks, runtime loop rule, selector tests, or package-layout checks. These enforce requirements specific to `nwsapi`.

The size-rule port preserves Wheelhouse's hard-cap-only justification marker. Files between 501 and 1,000 lines must split even when marked. Both bands fail local lint. Generated outputs and vendored fixtures stay outside the authored tooling scope.
