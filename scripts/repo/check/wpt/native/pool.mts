import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { CHROME_VERSION } from '../../../browser.mts'
import { isMainModule } from '../../../lib/run-node.mts'
import { REPO_ROOT } from '../../../lib/paths.mts'

export interface NativePins {
  browser: string
  revision: string
}
export interface NativePlan extends NativePins {
  scope: 'selector-candidates'
  experimental: false
  featurePolicy: 'browser-defaults'
  tests: Array<{
    test: string
    subsuite: string
    type: string
    disabled: boolean
  }>
}
export interface NativeReport {
  run_info: {
    browser_version: string
    revision: string
    product: string
    os?: string
    processor?: string
  }
  time_start: number
  time_end: number
  results: Array<{
    test: string
    subsuite?: string
    status: string
    subtests: Array<{ name: string; status: string }>
  }>
}
export interface NativeCase {
  test: string
  subsuite: string
  subtest: string | null
  type: string
}
export const caseKey = (entry: Omit<NativeCase, 'type'>) =>
  JSON.stringify([entry.subsuite, entry.test, entry.subtest])

export function nativePins(): NativePins {
  const revision = execFileSync(
    'git',
    ['config', '--file', '.gitmodules', '--get', 'submodule.upstream/wpt.ref'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  ).trim()
  const checkoutRevision = execFileSync(
    'git',
    ['-C', 'upstream/wpt', 'rev-parse', 'HEAD'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  ).trim()
  if (revision !== checkoutRevision) {
    throw new Error(
      'WPT checkout does not match the configured pin. Run pnpm run upstream:clone before native qualification.',
    )
  }
  return {
    browser: CHROME_VERSION,
    revision,
  }
}

function verifyReport(report: NativeReport, pins: NativePins) {
  if (
    report.run_info.product !== 'chrome' ||
    report.run_info.browser_version !== pins.browser ||
    report.run_info.revision !== pins.revision ||
    !Number.isFinite(report.time_start) ||
    !Number.isFinite(report.time_end) ||
    report.time_end < report.time_start
  ) {
    throw new Error(
      'Native report is unfinished or does not match the Chrome and WPT pins.',
    )
  }
}

function plannedTests(plan: NativePlan, pins: NativePins) {
  if (
    plan.scope !== 'selector-candidates' ||
    plan.experimental ||
    plan.featurePolicy !== 'browser-defaults' ||
    plan.browser !== pins.browser ||
    plan.revision !== pins.revision
  ) {
    throw new Error(
      'Native pool requires a candidate-run plan for the exact browser and WPT pins.',
    )
  }
  const planned = new Map(
    plan.tests
      .filter(test => !test.disabled)
      .map(test => [JSON.stringify([test.subsuite, test.test]), test]),
  )
  if (
    !planned.size ||
    planned.size !== plan.tests.filter(test => !test.disabled).length
  ) {
    throw new Error('Native plan is empty or contains duplicate test IDs.')
  }
  return planned
}

export function passingUniverse(
  plan: NativePlan,
  reports: NativeReport[],
  pins: NativePins,
) {
  const planned = plannedTests(plan, pins)
  if (!reports.length) {
    throw new Error('Native reports are required.')
  }
  const disabled = new Set(
    plan.tests
      .filter(test => test.disabled)
      .map(test => JSON.stringify([test.subsuite, test.test])),
  )
  const failedHarnesses = new Set<string>()
  const seen = new Set<string>()
  const observations = new Map<string, { entry: NativeCase; pass: boolean }>()
  const record = (entry: NativeCase, pass: boolean) => {
    const key = caseKey(entry)
    observations.set(key, {
      entry,
      pass: pass && (observations.get(key)?.pass ?? true),
    })
  }
  for (const report of reports) {
    verifyReport(report, pins)
    for (const result of report.results) {
      const key = JSON.stringify([result.subsuite || '', result.test])
      const plannedTest = planned.get(key)
      if (disabled.has(key) && ['SKIP', 'NOTRUN'].includes(result.status)) {
        continue
      }
      if (!plannedTest) {
        throw new Error(`Unplanned native test: ${result.test}`)
      }
      seen.add(key)
      const base = {
        test: result.test,
        subsuite: result.subsuite || '',
        type: plannedTest.type,
      }
      const harnessPassed = result.status === 'OK' || result.status === 'PASS'
      // Candidate pages may contain unrelated subtests. Assertion scope is checked separately.
      if (plannedTest.type !== 'testharness') {
        record({ ...base, subtest: null }, result.status === 'PASS')
      }
      for (const subtest of result.subtests) {
        record(
          { ...base, subtest: subtest.name },
          harnessPassed && subtest.status === 'PASS',
        )
      }
      if (!harnessPassed) {
        failedHarnesses.add(key)
      }
    }
  }
  const missing = [...planned.keys()].filter(key => !seen.has(key))
  if (missing.length) {
    throw new Error(
      `Incomplete native run: ${missing.length} planned tests have no result. First: ${missing[0]}`,
    )
  }
  return {
    ...pins,
    scope: 'candidate-native-passes' as const,
    planned: planned.size,
    observed: seen.size,
    disabled: plan.tests.filter(test => test.disabled).length,
    cases: [...observations.values()]
      .filter(
        value =>
          value.pass &&
          !failedHarnesses.has(
            JSON.stringify([value.entry.subsuite, value.entry.test]),
          ),
      )
      .map(value => value.entry)
      .toSorted((a, b) => caseKey(a).localeCompare(caseKey(b))),
  }
}

export interface SelectorReview extends Omit<NativeCase, 'type'> {
  kind: 'selector-parsing' | 'selector-matching'
  reason: string
}
export function narrowUniverse(
  pool: ReturnType<typeof passingUniverse>,
  reviews: SelectorReview[],
) {
  const passed = new Map(pool.cases.map(entry => [caseKey(entry), entry]))
  const selected = []
  const seen = new Set<string>()
  for (const review of reviews) {
    const key = caseKey(review)
    const entry = passed.get(key)
    if (
      !entry ||
      entry.type !== 'testharness' ||
      !review.reason.trim() ||
      !['selector-parsing', 'selector-matching'].includes(review.kind) ||
      seen.has(key)
    ) {
      throw new Error(
        `Scope review must name a unique passing native selector subtest: ${key}`,
      )
    }
    seen.add(key)
    selected.push({ ...entry, kind: review.kind, reason: review.reason })
  }
  return {
    ...pool,
    scope: 'native-passing-selectors' as const,
    nativePassing: pool.cases.length,
    cases: selected,
  }
}

if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      plan: { type: 'string' },
      report: { type: 'string', multiple: true },
      review: { type: 'string' },
      output: { type: 'string' },
    },
  })
  if (!values.plan || !values.report?.length || !values.output) {
    throw new Error(
      'Usage: native-pool.mts --plan plan.json --report report.json [--report shard.json] [--review reviewed-subtests.json] --output pool.json',
    )
  }
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'))
  const pool = passingUniverse(
    read(values.plan),
    values.report.map(read),
    nativePins(),
  )
  // Qualify candidate results before applying assertion-level scope.
  const result = values.review
    ? narrowUniverse(pool, read(values.review))
    : pool
  writeFileSync(
    values.output,
    JSON.stringify(
      {
        ...result,
        inputs: [values.plan, ...values.report].map(file => ({
          file,
          sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
        })),
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    `${pool.cases.length} native passes; ${result.cases.length} output cases.`,
  )
}
