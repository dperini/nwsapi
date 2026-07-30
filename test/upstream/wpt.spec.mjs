/*
 * Runs upstream WPT selector tests against this repo's src/nwsapi.js in a
 * real browser.
 *
 * For every page in manifest.mjs an init script is injected that evaluates
 * src/nwsapi.js and calls NW.Dom.install() before any page script runs,
 * overriding document.querySelector(All)/matches/closest with the NW engine
 * (the same trick the legacy test/wpt/wpt-helper.js used). Playwright runs
 * init scripts in every frame, so iframes used by the WPT pages get the NW
 * engine too — no need for install(true)'s iframe script injection.
 *
 * Results are collected through testharness.js' add_completion_callback,
 * registered on DOMContentLoaded (testharness.js is loaded by a synchronous
 * <script> in <head>, so it is always defined by then, and testharness only
 * completes after the window load event).
 *
 * Filtering (see README.md):
 *   WPT_FILTER  — substring or /regex/ applied to subtest names.
 *   WPT_SECTION — selectors.js section name substring (see sections.mjs).
 *
 * Known failures live in expectations.json; regenerate the baseline with:
 *   WPT_UPDATE_EXPECTATIONS=1 pnpm exec playwright test --project=upstream
 * (playwright.config.mjs forces --workers=1 while that env var is set, so
 * the per-file expectations.json rewrites cannot race).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { manifest } from './manifest.mjs';
import { getSection } from './sections.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const nwsapiSource = readFileSync(path.join(repoRoot, 'src', 'nwsapi.js'), 'utf8');
const expectationsPath = path.join(here, 'expectations.json');
const expectations = JSON.parse(readFileSync(expectationsPath, 'utf8'));

const updateExpectations = !!process.env.WPT_UPDATE_EXPECTATIONS;
const BASELINE_REASON = 'baseline @ wpt 7aed663';
const HARNESS_KEY = '__harness__';

const STATUS_NAMES = {
  0: 'PASS',
  1: 'FAIL',
  2: 'TIMEOUT',
  3: 'NOTRUN',
  4: 'PRECONDITION_FAILED',
};
const statusName = status => STATUS_NAMES[status] || `STATUS_${status}`;

// ---------------------------------------------------------------------------
// Subtest filtering: WPT_FILTER (substring or /regex/) and WPT_SECTION.
// ---------------------------------------------------------------------------
function buildSubtestFilter() {
  const rawFilter = process.env.WPT_FILTER;
  const rawSection = process.env.WPT_SECTION;
  const predicates = [];

  if (rawFilter) {
    const asRegex = /^\/(.*)\/([a-z]*)$/.exec(rawFilter);
    if (asRegex) {
      const re = new RegExp(asRegex[1], asRegex[2]);
      predicates.push(name => re.test(name));
    } else {
      predicates.push(name => name.includes(rawFilter));
    }
  }
  if (rawSection) {
    const wanted = rawSection.toLowerCase();
    predicates.push(name => {
      const section = getSection(name);
      return section !== null && section.toLowerCase().includes(wanted);
    });
  }
  return {
    active: predicates.length > 0,
    matches: name => predicates.every(fn => fn(name)),
  };
}

const filter = buildSubtestFilter();
if (filter.active && updateExpectations) {
  throw new Error('Refusing to update expectations.json with WPT_FILTER/WPT_SECTION set: the baseline must cover the full run.');
}

// ---------------------------------------------------------------------------
// Init script: nwsapi + install + testharness completion hook.
// ---------------------------------------------------------------------------
const initScript = `${nwsapiSource}
;(function () {
  try {
    window.NW.Dom.install();
  } catch (e) {
    window.__nwInstallError = String((e && e.stack) || e);
  }
  window.__wptResults = null;
  window.addEventListener('DOMContentLoaded', function () {
    if (typeof window.add_completion_callback !== 'function') { return; }
    window.add_completion_callback(function (tests, harnessStatus) {
      window.__wptResults = {
        installError: window.__nwInstallError || null,
        harness: {
          status: harnessStatus.status,
          message: harnessStatus.message == null ? null : String(harnessStatus.message)
        },
        tests: tests.map(function (t) {
          return {
            name: t.name,
            status: t.status,
            message: t.message == null ? null : String(t.message)
          };
        })
      };
    });
  });
})();
`;

// ---------------------------------------------------------------------------
// Baseline maintenance (WPT_UPDATE_EXPECTATIONS=1, run with --workers=1).
// ---------------------------------------------------------------------------
function rewriteBaseline(filePath, failingKeys) {
  const current = JSON.parse(readFileSync(expectationsPath, 'utf8'));
  const next = {};
  for (const [key, reason] of Object.entries(current)) {
    if (!key.startsWith(`${filePath}::`)) {
      next[key] = reason;
    }
  }
  for (const key of failingKeys) {
    next[key] = current[key] || BASELINE_REASON;
  }
  const sorted = Object.fromEntries(
    Object.entries(next).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  writeFileSync(expectationsPath, `${JSON.stringify(sorted, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// One playwright test per manifest entry.
// ---------------------------------------------------------------------------
for (const entry of manifest) {
  test(entry.path, async ({ page }) => {
    await page.addInitScript({ content: initScript });
    const response = await page.goto(entry.path);
    expect(response, `no HTTP response for ${entry.path}`).not.toBeNull();
    expect(
      response.ok(),
      `HTTP ${response.status()} for ${entry.path} — is scripts/serve.mjs the server on port 8000?`,
    ).toBe(true);

    // Fail fast if the loaded page has no testharness at all (e.g. a stranger
    // process answered on port 8000) instead of burning the 80s results wait.
    try {
      await page.waitForFunction(
        'typeof window.add_completion_callback === "function"',
        null, { timeout: 5_000 },
      );
    } catch {
      throw new Error(
        `${entry.path} loaded but exposes no testharness.js (window.add_completion_callback) `
        + 'after 5s — whatever is listening on port 8000 is not scripts/serve.mjs '
        + 'serving upstream/wpt.',
      );
    }

    // NW-install canary: nwsapi's querySelectorAll returns an Array, the
    // native engine a NodeList. Catches a silently-broken install().
    const nwInstalled = await page.evaluate(
      'Array.isArray(document.querySelectorAll("html"))',
    );
    expect(
      nwInstalled,
      'document.querySelectorAll must return an Array (nwsapi installed), got the native engine',
    ).toBe(true);

    // String expressions: these evaluate in the page, where `window` exists.
    await page.waitForFunction('window.__wptResults', null, { timeout: 80_000 });
    const results = await page.evaluate('window.__wptResults');

    expect(results.installError, 'NW.Dom.install() must not throw').toBeNull();

    const counts = {
      pass: 0, fail: 0, expectedFail: 0, unexpectedPass: 0, filtered: 0,
    };
    const failures = [];
    const expectedFails = [];
    const unexpectedPasses = [];
    const failingKeys = [];

    for (const t of results.tests) {
      const key = `${entry.path}::${t.name}`;
      if (t.status !== 0) {
        failingKeys.push(key);
      }
      if (!filter.matches(t.name)) {
        counts.filtered += 1;
        continue;
      }
      if (t.status === 0) {
        if (expectations[key]) {
          counts.unexpectedPass += 1;
          unexpectedPasses.push(t.name);
        } else {
          counts.pass += 1;
        }
      } else if (expectations[key]) {
        counts.expectedFail += 1;
        expectedFails.push(`${statusName(t.status)} ${t.name}`);
      } else {
        counts.fail += 1;
        failures.push(`${statusName(t.status)}: ${t.name}${t.message ? ` — ${t.message}` : ''}`);
      }
    }

    const harnessKey = `${entry.path}::${HARNESS_KEY}`;
    if (results.harness.status !== 0) {
      failingKeys.push(harnessKey);
      if (expectations[harnessKey]) {
        expectedFails.push(`harness status ${results.harness.status}`);
      } else {
        failures.push(`harness status ${results.harness.status}: ${results.harness.message || '(no message)'}`);
      }
    }

    console.log(
      `[wpt] ${entry.path} — passed ${counts.pass}, failed ${counts.fail}, `
      + `expected-fail ${counts.expectedFail}, unexpected-pass ${counts.unexpectedPass}, `
      + `skipped-by-filter ${counts.filtered} (of ${results.tests.length} subtests)`,
    );
    for (const name of unexpectedPasses) {
      console.log(`[wpt]   warn: UNEXPECTED PASS (listed in expectations.json): ${name}`);
    }
    if (expectedFails.length > 0 && expectedFails.length <= 25) {
      for (const line of expectedFails) {
        console.log(`[wpt]   warn: expected ${line}`);
      }
    } else if (expectedFails.length > 25) {
      console.log(`[wpt]   warn: ${expectedFails.length} expected failures (see expectations.json)`);
    }

    if (updateExpectations) {
      rewriteBaseline(entry.path, failingKeys);
      console.log(`[wpt]   baseline updated: ${failingKeys.length} expected failure(s) recorded for ${entry.path}`);
      return;
    }

    // A harness-level failure (already collected into `failures` above) must
    // fail the file even when a filter matches zero subtests, so the skip
    // decision only applies to clean runs.
    test.skip(
      filter.active
      && failures.length === 0
      && counts.pass + counts.fail + counts.expectedFail + counts.unexpectedPass === 0,
      'no subtests match WPT_FILTER/WPT_SECTION',
    );

    expect(failures, 'subtests failing outside the expectations.json baseline').toEqual([]);
  });
}
