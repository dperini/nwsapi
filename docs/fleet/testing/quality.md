# Test quality and consolidation

A good test checks a meaningful behavior of the current implementation. Its name explains the case, its fixture makes the conditions clear, and its assertions would fail if that behavior broke.

## Test the current source and built output

Use `src/` imports for focused implementation tests. Use the current `dist/` output or an installed package built from the current checkout for distribution tests. Build that output before testing it. Verify package resolution so an alias cannot silently substitute a different version.

A `-stable` package can provide fixture helpers or reference expectations. It must not provide the actual result being tested. For example, compute the actual result with the current implementation, then compare it with a fixed expectation or an appropriate reference implementation.

Check both sides of differential tests. If actual and expected resolve to the same stable package, the test can pass while the current code is broken. A reference can also share a defect, so retain explicit expected results for important contracts.

## Assert the behavior that matters

Cover normal inputs, boundaries, and relevant failures. Check observable values, state changes, errors, or process behavior. Avoid assertions that merely prove a mock was configured or that repeat the algorithm under test.

Keep failures understandable. Prefer a small fixture and a precise assertion over a large snapshot with unrelated output. Keep snapshots when the complete output is the contract and reviewers can evaluate changes to it.

Use mocks at external boundaries while keeping the implementation under test real. Retain integration cases for contracts that depend on actual filesystem, process, transport, or package behavior. Follow the [coverage guidance](coverage.md) for accessible methods and environment helpers.

## Parse code when checking code structure

Prefer behavior tests. When syntax structure is itself the contract, use a parser for that language and inspect its syntax tree. A syntax tree represents declarations, calls, arguments, and other language constructs independently of formatting.

Do not use regular expressions to recognize code structure. Comments, strings, nested expressions, aliases, and formatting can make a text match report the wrong result. Use the repository's installed parser and fail visibly when the source cannot be parsed. Parse each selected file once and reuse the result for related checks.

Regular expressions remain appropriate for testing an actual text or pattern contract. They do not replace parsing JavaScript, TypeScript, shell, or another structured language.

## Review consolidation candidates

Run `node scripts/fleet/review-test-quality.mts <test-file> [test-file...]` on an explicit selection. The report compares parsed test callbacks while ignoring source positions and formatting. It also lists imports from `-stable` packages for review. It never rewrites or deletes tests.

Matching callbacks are candidates, not proof of duplicate behavior. The same callback can run against different fixtures, setup hooks, parameters, platforms, imports, or package builds. Review those conditions before merging cases. The report does not resolve bindings, aliases, dynamic imports, or the actual value passed to an assertion. It recognizes conventional `test` and `it` calls and named Vitest imports, including aliases. Generated tests and custom wrappers need manual review.

Consolidate tests only when their behavior and execution conditions overlap. Use table-driven cases when they share setup and assertions but differ in inputs. Preserve descriptive case names, distinct regressions, error paths, and required process contracts.

Compare the original cases with the proposed cases before editing. Record which retained case protects each removed case's behavior. Similar names, equal coverage percentages, or identical source alone do not establish equivalence.

## Verify discovery and registration

After renaming or splitting a test file, verify its selected package, project, and fixture. Some helpers infer package identity from the filename. Pass an explicit identity when the new filename no longer carries that meaning. Check the discovered file count, executed case count, and skipped cases. An exit code of zero with no relevant tests is not a successful check.

For lint rules, hooks, and plugins, verify that the real runner registers and invokes the implementation under review. Importing a rule object in a test does not prove that a subprocess loads that object. Include a known-invalid fixture that must produce a finding, and check that the ordinary entry point observes it.

Keep command-line work behind the module's main-entry guard. Importing exported helpers must not start a command, contact a service, or exit the test process. Test the helpers directly and invoke the script with a safe help or status option to check its entry point.

Scope exclusions describe work outside the runner's supported contract. Do not add failing in-scope cases to an exclusion list. Preserve conformance fixtures and investigate unexpected skips after changing discovery settings.

## Verify the quality pass

Run the affected tests before and after consolidation. Check case coverage, assertion meaning, fixture isolation, and the origin of actual results. Compare coverage maps and required source files through the [coverage workflow](coverage.md). Explain intended changes to test counts.

Measure repeated setup and subprocess costs using the [performance guidance](performance.md). Keep lane budgets and required CI suites intact. Report what was consolidated, which behaviors remain protected, and any uncertain candidates left unchanged.
