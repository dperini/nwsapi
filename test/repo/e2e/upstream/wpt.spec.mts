/*
 * Runs upstream WPT selector tests against this repo's dist/nwsapi.js in a
 * real browser.
 *
 * For every page in manifest.mts an init script is injected that evaluates
 * dist/nwsapi.js and calls NW.Dom.install() before any page script runs,
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
 * Filtering (see docs/repo/testing/wpt-runner.md):
 *   WPT_FILTER  — substring or /regex/ applied to subtest names.
 *   WPT_SECTION — selectors.js section name substring (see sections.mts).
 *
 * Known failures live in expectations.json; regenerate the baseline with:
 *   WPT_UPDATE_EXPECTATIONS=1 pnpm run test:wpt
 * (.config/playwright.config.mts forces --workers=1 while that env var is set, so
 * the per-file expectations.json rewrites cannot race).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { manifest } from './manifest.mts'
import { getSection } from './sections.mts'
import {
  pageContentType,
  pageSource,
} from '../../../../scripts/repo/check/wpt/source/inspect.mts'
import { isAgent } from '../../../../scripts/repo/lib/is-agent.mts'

const here = path.dirname(fileURLToPath(import.meta.url))
import { REPO_ROOT as repoRoot } from '../../../../scripts/repo/lib/paths.mts'
const nwsapiSource = readFileSync(path.join(repoRoot, 'dist/nwsapi.js'), 'utf8')
const legacyModule = readFileSync(
  path.join(repoRoot, 'dist/modules/nwsapi-legacy.js'),
  'utf8',
)
const forceLegacy = process.env['NWSAPI_LEGACY'] === '1'
const legacySource = forceLegacy
  ? legacyModule + '\nNW.Dom.configure({ LEGACY: true });'
  : ''
const expectationsPath = path.join(here, 'expectations.json')
const engineSha256 = createHash('sha256').update(nwsapiSource).digest('hex')
const wptRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: path.join(repoRoot, 'upstream/wpt'),
  encoding: 'utf8',
}).trim()
const coverageDirectory = process.env['WPT_COVERAGE_DIR']
const coverageURL = 'http://nwsapi.test/dist/nwsapi.js'
if (
  coverageDirectory &&
  (process.env['WPT_FILTER'] ||
    process.env['WPT_SECTION'] ||
    process.env['WPT_UPDATE_EXPECTATIONS'])
) {
  throw new Error('WPT coverage requires the complete suite.')
}
const expectations: Record<string, string> = JSON.parse(
  readFileSync(expectationsPath, 'utf8'),
)
const parsingHelpers = readFileSync(
  path.join(here, '../fixture/upstream/parsing-helpers.js'),
  'utf8',
)

const updateExpectations = !!process.env['WPT_UPDATE_EXPECTATIONS']
const BASELINE_REASON = 'master fe15bc3; WPT 7aed663; Chromium 151.0.7922.34'
const HARNESS_KEY = '__harness__'

const STATUS_NAMES: Record<number, string> = {
  0: 'PASS',
  1: 'FAIL',
  2: 'TIMEOUT',
  3: 'NOTRUN',
  4: 'PRECONDITION_FAILED',
}
const statusName = (status: number) =>
  STATUS_NAMES[status] || `STATUS_${status}`

// ---------------------------------------------------------------------------
// Subtest filtering: WPT_FILTER (substring or /regex/) and WPT_SECTION.
// ---------------------------------------------------------------------------
function buildSubtestFilter() {
  const rawFilter = process.env['WPT_FILTER']
  const rawSection = process.env['WPT_SECTION']
  const predicates: Array<(name: string) => boolean> = []

  if (rawFilter) {
    const asRegex = /^\/(.*)\/([a-z]*)$/.exec(rawFilter)
    if (asRegex) {
      const re = new RegExp(asRegex[1]!, asRegex[2])
      predicates.push((name: string) => re.test(name))
    } else {
      predicates.push((name: string) => name.includes(rawFilter))
    }
  }
  if (rawSection) {
    const wanted = rawSection.toLowerCase()
    predicates.push((name: string) => {
      const section = getSection(name)
      return section !== null && section.toLowerCase().includes(wanted)
    })
  }
  return {
    active: predicates.length > 0,
    matches: (name: string) => predicates.every(fn => fn(name)),
  }
}

const filter = buildSubtestFilter()
if (filter.active && updateExpectations) {
  throw new Error(
    'Refusing to update expectations.json with WPT_FILTER/WPT_SECTION set: the baseline must cover the full run.',
  )
}

// ---------------------------------------------------------------------------
// Init script: nwsapi + install + testharness completion hook.
// ---------------------------------------------------------------------------
// A named script separates engine coverage from the harness, including frames.
const engineScript =
  (coverageDirectory
    ? `(0, eval)(${JSON.stringify(`${nwsapiSource}\n//# sourceURL=${coverageURL}`)});`
    : nwsapiSource) +
  '\n' +
  legacySource
const installationScript = `;(function () {
  try {
    window.__nwLegacyMode = window.NW.Dom.Config.LEGACY;
    var targets = [
      [Document.prototype, 'querySelector'],
      [Document.prototype, 'querySelectorAll'],
      [Element.prototype, 'querySelector'],
      [Element.prototype, 'querySelectorAll'],
      [DocumentFragment.prototype, 'querySelector'],
      [DocumentFragment.prototype, 'querySelectorAll'],
      [Element.prototype, 'matches'],
      [Element.prototype, 'closest']
    ];
    var nativeMethods = targets.map(function (target) { return target[0][target[1]]; });
    window.NW.Dom.install();
    window.__nwInstalledAPIs = targets.map(function (target, index) {
      return target[0][target[1]] !== nativeMethods[index];
    });
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
`

// ---------------------------------------------------------------------------
// Baseline maintenance (WPT_UPDATE_EXPECTATIONS=1, run with --workers=1).
// ---------------------------------------------------------------------------
function rewriteBaseline(filePath: string, failingKeys: string[]) {
  const current = JSON.parse(readFileSync(expectationsPath, 'utf8'))
  const next: Record<string, unknown> = {}
  for (const [key, reason] of Object.entries(current)) {
    if (!key.startsWith(`${filePath}::`)) {
      next[key] = reason
    }
  }
  for (const key of failingKeys) {
    next[key] = current[key] || BASELINE_REASON
  }
  const sorted = Object.fromEntries(
    Object.entries(next).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )
  writeFileSync(expectationsPath, `${JSON.stringify(sorted, null, 2)}\n`)
}

// ---------------------------------------------------------------------------
// One playwright test per manifest entry.
// ---------------------------------------------------------------------------
for (const entry of manifest) {
  // oxlint-disable-next-line eslint/complexity -- Keep each page and its coverage lifecycle in one test.
  test(entry.path, async ({ page, browser }) => {
    if (entry.parsing) {
      await page.route('**/css/support/parsing-testcommon.js', route =>
        route.fulfill({ contentType: 'text/javascript', body: parsingHelpers }),
      )
    }
    if (
      entry.path.endsWith('/parse-anplusb.html') ||
      entry.selectorInputs ||
      entry.supportsInputs ||
      entry.selectorTests ||
      entry.domOnly ||
      entry.script
    ) {
      await page.route(`**${entry.path}`, route =>
        route.fulfill({
          contentType: pageContentType(entry.path),
          body: pageSource(entry),
        }),
      )
    }
    if (coverageDirectory) {
      await page.coverage.startJSCoverage({ resetOnNavigation: false })
    }
    const installation =
      entry.install === false
        ? installationScript.replace('window.NW.Dom.install();', '')
        : installationScript
    const content = `${engineScript}\n${entry.legacyMap ? legacyModule : ''}\n${installation}`
    await page.addInitScript({
      content: entry.legacyMap
        ? `const savedMap = window.Map, savedWeakMap = window.WeakMap;
          try { window.Map = window.WeakMap = undefined; ${content} }
          finally { window.Map = savedMap; window.WeakMap = savedWeakMap; }`
        : content,
    })
    const response = await page.goto(entry.path)
    expect(response, `no HTTP response for ${entry.path}`).not.toBeNull()
    expect(
      response!.ok(),
      `HTTP ${response!.status()} for ${entry.path} — is scripts/repo/serve.mts the server on port 8000?`,
    ).toBe(true)

    // Installation is verified by method identity, independently of the
    // collection shape that the DOM wrappers correctly expose.
    const nwInstalled = await page.evaluate(
      entry.install === false
        ? 'typeof window.NW.Dom.match === "function"'
        : 'typeof window.NW.Dom.match === "function" && Object.values(window.__nwInstalledAPIs).every(Boolean)',
    )
    expect(
      await page.evaluate('window.__nwLegacyMode'),
      'WPT initialization must use the requested legacy mode',
    ).toBe(forceLegacy)
    expect(
      nwInstalled,
      'document.querySelectorAll must return an Array (nwsapi installed), got the native engine',
    ).toBe(true)

    if (entry.install !== false) {
      expect(
        await page.evaluate('window.__nwInstalledAPIs'),
        'Document, Element and Fragment query methods, matches and closest must all use NWSAPI',
      ).toEqual(Array(8).fill(true))
    }

    // String expressions: these evaluate in the page, where `window` exists.
    await page.waitForFunction('window.__wptResults', null, { timeout: 80_000 })
    const results = await page.evaluate<{
      installError: string | null
      harness: { status: number; message: string | null }
      tests: Array<{ name: string; status: number; message: string | null }>
    }>('window.__wptResults')
    if (coverageDirectory) {
      const coverage = (await page.coverage.stopJSCoverage()).filter(
        script => script.url === coverageURL,
      )
      expect(
        coverage.length,
        'WPT must execute the named nwsapi script',
      ).toBeGreaterThan(0)
      writeFileSync(
        path.join(coverageDirectory, `${manifest.indexOf(entry)}.json`),
        JSON.stringify(coverage),
      )
    }

    expect(results.installError, 'NW.Dom.install() must not throw').toBeNull()

    const counts = {
      pass: 0,
      fail: 0,
      expectedFail: 0,
      unexpectedPass: 0,
      filtered: 0,
    }
    const failures = []
    const expectedFails = []
    const unexpectedPasses = []
    const failingKeys = []

    for (const t of results.tests) {
      const key = `${entry.path}::${t.name}`
      if (t.status !== 0) {
        failingKeys.push(key)
      }
      if (!filter.matches(t.name)) {
        counts.filtered += 1
        continue
      }
      if (t.status === 0) {
        if (expectations[key]) {
          counts.unexpectedPass += 1
          unexpectedPasses.push(t.name)
        } else {
          counts.pass += 1
        }
      } else if (expectations[key]) {
        counts.expectedFail += 1
        expectedFails.push(
          `${statusName(t.status)} ${t.name}${t.message ? ` — ${t.message}` : ''}`,
        )
      } else {
        counts.fail += 1
        failures.push(
          `${statusName(t.status)}: ${t.name}${t.message ? ` — ${t.message}` : ''}`,
        )
      }
    }

    const harnessKey = `${entry.path}::${HARNESS_KEY}`
    if (results.harness.status !== 0) {
      failingKeys.push(harnessKey)
      if (expectations[harnessKey]) {
        expectedFails.push(`harness status ${results.harness.status}`)
      } else {
        failures.push(
          `harness status ${results.harness.status}: ${results.harness.message || '(no message)'}`,
        )
      }
    }

    await test.info().attach('wpt-subtests', {
      body: JSON.stringify({
        path: entry.path,
        origin: entry.path.startsWith('/_repo/') ? 'local' : 'upstream',
        adaptation: entry.parsing
          ? 'selector-validity'
          : entry.domOnly || entry.selectorTests
            ? 'selector-matching'
            : entry.script
              ? 'script-wrapper'
              : null,
        engineSha256,
        wptRevision,
        browser: browser.version(),
        total: results.tests.length,
        counts,
        harness: results.harness,
        expectedFailures: expectedFails,
        knownFailures: results.tests
          .filter(
            t => t.status !== 0 && expectations[`${entry.path}::${t.name}`],
          )
          .map(t => ({
            name: t.name,
            status: statusName(t.status),
            reason: expectations[`${entry.path}::${t.name}`],
          })),
        unexpectedFailures: failures,
      }),
      contentType: 'application/json',
    })

    const verbose =
      !isAgent() ||
      failures.length > 0 ||
      unexpectedPasses.length > 0 ||
      updateExpectations
    if (verbose) {
      console.log(
        `[wpt] ${entry.path} — passed ${counts.pass}, failed ${counts.fail}, ` +
          `expected-fail ${counts.expectedFail}, unexpected-pass ${counts.unexpectedPass}, ` +
          `skipped-by-filter ${counts.filtered} (of ${results.tests.length} subtests)`,
      )
    }
    for (const name of unexpectedPasses) {
      console.log(
        `[wpt]   warn: UNEXPECTED PASS (listed in expectations.json): ${name}`,
      )
    }
    if (verbose && expectedFails.length > 0 && expectedFails.length <= 25) {
      for (const line of expectedFails) {
        console.log(`[wpt]   warn: expected ${line}`)
      }
    } else if (verbose && expectedFails.length > 25) {
      console.log(
        `[wpt]   warn: ${expectedFails.length} expected failures (see expectations.json)`,
      )
    }

    if (updateExpectations) {
      rewriteBaseline(entry.path, failingKeys)
      console.log(
        `[wpt]   baseline updated: ${failingKeys.length} expected failure(s) recorded for ${entry.path}`,
      )
      return
    }

    // A harness-level failure (already collected into `failures` above) must
    // fail the file even when a filter matches zero subtests, so the skip
    // decision only applies to clean runs.
    test.skip(
      filter.active &&
        failures.length === 0 &&
        counts.pass +
          counts.fail +
          counts.expectedFail +
          counts.unexpectedPass ===
          0,
      'no subtests match WPT_FILTER/WPT_SECTION',
    )

    expect(
      failures,
      'subtests failing outside the expectations.json baseline',
    ).toEqual([])
  })
}
