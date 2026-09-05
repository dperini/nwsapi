# Selector regressions

This PR preserves the cross-feature tests from #167 at
`bc704565c1bd14f1f22c285cc76d4e507687acaa`. It changes no engine code.
Assertions remain intact, including failures on master. Do not merge it as
a green baseline or replace failures with skips.

Use Node.js ≥ 22 at a patch level supported by jsdom 30: Node 22.22.2+,
24.15.0+, or 26+. This is development guidance, not a runtime requirement
for nwsapi.

```sh
pnpm install
pnpm run test:regressions
pnpm exec playwright install chromium
pnpm run test:regressions:browser
```

Neither command starts the WPT server or requires its checkout. The browser
suite leaves native selectors installed and compares against Chromium.
The Node suite uses jsdom 30's independent selector engine, except for form
state assertions with explicit browser-derived expectations.

## Ownership

The tests span fixes that must also be exercised together:

| Coverage | Engine PRs |
| --- | --- |
| Host matcher reentry and document state | #178 |
| Logical parsing, attribute suffixes, optimizer nesting | #180, #182, #199 |
| Cache retention, context reuse and turnover | #185, #188, #189 |
| Constant positional selectors | #184 |
| Disabled, required and validity state | #190, #191, #192 |
| Custom-element definition and upgrade | #193 |
| SVG class and escaped ID reads | #194 |
| Relative selectors | #201 |
| Legacy host reads | #203 |
| Compound negation, descendant routing and lazy hover | #204, #206, #207 |

ID lookup and link/placeholder controls already have their fixes on master.
The namespace test keeps its known-gap expectation. Focused successor PRs
also carry local tests; their overlap here intentionally preserves the
original integration coverage until the combined changes are validated.

On master `62d45eb`, the Node suite reports 30 passing and 16 failing tests;
Chromium 151.0.7922.34 reports two passing and two failing tests. These are
the pending fixes above, not a passing merge gate. All 46 Node tests and
four browser tests retain their archived assertions.

The 15 inherited Node tests, including the adapter suite, pass separately.
