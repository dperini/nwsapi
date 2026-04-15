# Browser harness (Playwright)

Browser-based tests for `nwsapi`, migrated from older selector suites and run under Playwright.

The harness compares `NW.Dom` against native DOM behavior in Chromium, Firefox, and WebKit. Tests run inside the page via `page.evaluate()`, which makes it possible to measure native browser results directly and compare them against `nwsapi` under the same fixture and context.

## Install

Requires Node.js (which includes npm).

```sh
npm install
npx playwright install
```

`npm install` pulls in the dev dependencies needed to run the scripts. `npx playwright install` installs the browser binaries used by the harness.

## Run

Run the full browser harness:

```sh
npm run test:browser
```

Run only cases marked `fixme`:

```sh
npm run test:browser:fixme
```

Run a subset by label, for example:

```sh
npm run test:browser jquery
npm run test:browser:fixme w3c
```

For faster iteration, run a subset by label or mark a scenario/case `only`.

`fixme` cases are open questions or known mismatches found during migration and need review.

## Tests

Tests are written as scenario collections and run through the shared harness.

A typical test file looks like this:

```ts
import { runScenarios } from './harness/scenarios';

runScenarios('jquery', 'normal', [
  {
    name: 'id selectors',
    html: `<div id="a"></div><div id="b"></div>`,
    cases: [
      { select: '#a', expect: { ids: ['a'] } },
      { select: '#b', expect: { ids: ['b'] } },
    ],
  },
]);
```

## Scenarios

Scenarios can:

- choose engines (`nw`, `native`) and browsers
- provide inline HTML fixtures
- use `setupPage` to run page-side JavaScript before assertions
- use steps to change page state between groups of cases
- express cases using `select`, `first`, `match`, `closest`, `byId`, `byTag`, and `byClass`
- attach expectations such as `count`, `ids`, `classes`, `throws`, and inclusion/exclusion checks
- use context refs when a query should run relative to a specific node, including rehomed contexts for detached nodes and fragments
- mark scenarios or cases as `skip`, `only`, `fail`, or `fixme`
