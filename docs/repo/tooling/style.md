# Style configuration

The authoring settings in `.config/oxfmt.json` match Wheelhouse's base formatter profile. The extension override preserves property quoting because these scripts retain their registration format. Distribution formatting stays in `.config/build.config.mts`, where the measured file-size choices are documented.

The base `oxlint` profile already carries Wheelhouse's braces rule and complexity limit of 15. Complexity now applies to source helpers as well as scripts. Three existing monolithic implementations retain their previous exception: the selector engine, its adapter, and the legacy extension. This is a limited exception, not a claim that those functions meet the limit. The direction helper now separates slot-host lookup to meet the limit without changing its traversal decisions.

## Ported custom rules

The following rules are adapted from `socket-wheelhouse/template/base/universal/.config/fleet/oxlint-plugin/`. They run through the repository's existing `nwsapi` plugin during `pnpm run check`.

| Wheelhouse rule                     | Local rule                          | Purpose                                                                       |
| ----------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `socket/max-comment-block-lines`    | `nwsapi/max-comment-block-lines`    | Reports oversized inline and documentation comments.                          |
| `socket/no-comment-glob-star-slash` | `nwsapi/no-comment-glob-star-slash` | Fixes escaped glob text that formatting could turn into a comment terminator. |
| `socket/no-process-chdir`           | `nwsapi/no-process-chdir`           | Requires explicit working directories outside tests.                          |
| `socket/no-minified-bundler-output` | `nwsapi/no-minified-bundler-output` | Rejects minification and bundled source-map output.                           |

The ports use the installed `oxlint` AST types. They do not add a Socket library dependency. Standard local `oxlint-disable-next-line` comments remain available for a specific rule with a reason. Wheelhouse's custom bypass and mirror-marker infrastructure is not imported.

## Other rules reviewed

Socket API tokens, private registry conventions, Socket library import preferences, fleet workflow names, and Wheelhouse-generated file ownership do not apply here. They are not enabled.

The source-content test rule is relevant, but porting it requires migrating the remaining document and source assertions. The shared practice prohibits new instances now. This pass does not claim that existing assertions are all migrated or that the prohibition is lint-enforced. The broader prose vocabulary rules also depend on Wheelhouse's hook pattern libraries. Their writing guidance is imported, but their hook runtime is not.

The audit does not replace the existing ES5 compatibility checks, runtime loop rule, selector tests, or package-layout checks. These enforce requirements specific to `nwsapi`.
