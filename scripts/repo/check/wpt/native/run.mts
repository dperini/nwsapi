import { writeNativeContract } from './contract.mts'
import { discoverNative } from './discovery.mts'
import { nativeBrowserLauncher } from './browser.mts'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  globSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { Browser, install } from '@puppeteer/browsers'
import {
  browserInstallOptions,
  browserLaunchOptions,
} from '../../../browser.mts'
import {
  nativePins,
  passingUniverse,
  type NativePlan,
  type NativePins,
  type NativeReport,
} from './pool.mts'
import { classifyPool } from './scope.mts'
import { isMainModule } from '../../../lib/run-node.mts'

type TestList = Record<
  string,
  Record<string, Record<string, { disabled: boolean }>>
>
export function candidateRunPlan(list: TestList, pins: NativePins): NativePlan {
  return {
    ...pins,
    scope: 'selector-candidates',
    experimental: false,
    featurePolicy: 'browser-defaults',
    tests: Object.entries(list).flatMap(([subsuite, types]) =>
      Object.entries(types).flatMap(([type, tests]) =>
        Object.entries(tests).map(([test, info]) => ({
          test,
          subsuite,
          type,
          disabled: info.disabled,
        })),
      ),
    ),
  }
}

export function missingNativeCandidates(
  candidates: Array<{ test: string }>,
  plans: NativePlan[],
) {
  const recorded = new Set(
    plans.flatMap(plan => plan.tests.map(test => test.test)),
  )
  return candidates.filter(candidate => !recorded.has(candidate.test))
}

export function readNativeRuns(directory: string) {
  const files = globSync('plan*.json', { cwd: directory })
    .filter(file => /^plan(?:-\d+)?\.json$/.test(file))
    .toSorted()
  if (!files.length) {
    throw new Error('No native execution plan was recorded.')
  }
  return files.map(file => ({
    plan: JSON.parse(
      readFileSync(path.join(directory, file), 'utf8'),
    ) as NativePlan,
    report: JSON.parse(
      readFileSync(
        path.join(directory, file.replace('plan', 'report')),
        'utf8',
      ),
    ) as NativeReport,
    files: [file, file.replace('plan', 'report')],
  }))
}

export async function runNative(directory: string, resume = false) {
  const pins = nativePins()
  const checkout = path.join(directory, 'wpt')
  const run = (command: string, args: string[], cwd = directory) =>
    execFileSync(command, args, { cwd, stdio: 'inherit' })
  console.log(
    `Candidate native WPT run: Chrome ${pins.browser}, WPT ${pins.revision}\nArtifacts: ${directory}`,
  )
  const previous = resume ? readNativeRuns(directory) : []
  for (const { plan, report } of previous) {
    passingUniverse(plan, [report], pins)
  }
  if (!resume && existsSync(path.join(directory, 'plan.json'))) {
    throw new Error(
      'Recorded run exists. Use --resume to qualify additions without replacing it.',
    )
  }
  if (!existsSync(checkout)) {
    run('git', [
      'clone',
      '--depth=1',
      '--filter=blob:none',
      '--no-checkout',
      'https://github.com/web-platform-tests/wpt.git',
      checkout,
    ])
  }
  if (!resume) {
    run(
      'git',
      ['fetch', '--depth=1', '--filter=blob:none', 'origin', pins.revision],
      checkout,
    )
    run('git', ['checkout', '--detach', 'FETCH_HEAD'], checkout)
  }
  run('python3', ['wpt', 'manifest'], checkout)
  const discovery = discoverNative(checkout, pins.revision)
  const candidates = missingNativeCandidates(
    discovery.candidates,
    previous.map(recorded => recorded.plan),
  )
  if (!candidates.length) {
    analyzeNative(directory, discovery)
    return
  }
  const suffix = resume ? '-' + (previous.length + 1) : ''
  const driver = await install({
    ...browserInstallOptions,
    browser: Browser.CHROMEDRIVER,
  })
  const launcher = path.join(directory, 'native-chrome.sh')
  writeFileSync(
    launcher,
    nativeBrowserLauncher(browserLaunchOptions().executablePath),
  )
  chmodSync(launcher, 0o700)
  writeFileSync(
    path.join(directory, 'discovery.json'),
    JSON.stringify(discovery) + '\n',
  )
  const includes = path.join(directory, `candidates${suffix}.txt`)
  writeFileSync(includes, candidates.map(entry => entry.test).join('\n') + '\n')
  if (!discovery.candidates.length) {
    throw new Error('No selector candidates discovered.')
  }
  console.log(
    `Discovered ${discovery.candidates.length} candidate URLs from ${discovery.scanned} testharness URLs. Running ${candidates.length} unrecorded URLs.`,
  )
  const args = [
    'wpt',
    'run',
    '--yes',
    'chrome',
    '--channel=beta',
    '--binary',
    launcher,
    '--webdriver-binary',
    driver.executablePath,
    '--headless',
    '--processes=4',
    '--no-enable-experimental',
    '--include-file',
    includes,
    '--test-types=testharness',
  ]
  // Enumeration and execution share the same generated candidate selection.
  const listing = execFileSync('python3', [...args, '--list-tests-json'], {
    cwd: checkout,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const plan = candidateRunPlan(
    JSON.parse(listing.slice(listing.indexOf('{'))),
    pins,
  )
  writeFileSync(
    path.join(directory, `plan${suffix}.json`),
    JSON.stringify(plan) + '\n',
  )
  console.log(
    `Enumerated ${plan.tests.length} native tests, including disabled entries.`,
  )
  const reportPath = path.join(directory, `report${suffix}.json`)
  const result = spawnSync(
    'python3',
    [
      ...args,
      '--log-wptreport',
      reportPath,
      '--log-raw',
      path.join(directory, `events${suffix}.jsonl`),
    ],
    { cwd: checkout, stdio: 'inherit' },
  )
  if (result.error) {
    throw result.error
  }
  // Native failures are results, not a reason to discard the run. Completeness is checked against the full plan.
  analyzeNative(directory, discovery)
  console.log(`Native runner exit status: ${result.status}.`)
}

export function analyzeNative(
  directory: string,
  discovery?: ReturnType<typeof discoverNative>,
) {
  const pins = nativePins()
  const runs = readNativeRuns(directory)
  console.log(
    `Checking candidate discovery against ${runs.length} recorded execution plans.`,
  )
  discovery ||= discoverNative(path.join(directory, 'wpt'), pins.revision)
  const missing = missingNativeCandidates(
    discovery.candidates,
    runs.map(run => run.plan),
  )
  if (missing.length) {
    throw new Error(
      `Discovery found ${missing.length} unrecorded candidate URLs. Run test:wpt:native --resume --directory ${directory} before finalization.`,
    )
  }
  for (const { plan, report } of runs) {
    passingUniverse(plan, [report], pins)
  }
  const plan = {
    ...runs[0]!.plan,
    tests: [
      ...new Map(
        runs.flatMap(run =>
          run.plan.tests.map(
            test => [JSON.stringify([test.subsuite, test.test]), test] as const,
          ),
        ),
      ).values(),
    ],
  }
  const reports = runs.map(run => run.report)
  console.log(`Qualifying ${plan.tests.length} recorded URLs.`)
  const pool = passingUniverse(plan, reports, pins)
  writeFileSync(
    path.join(directory, 'discovery.json'),
    JSON.stringify(discovery) + '\n',
  )
  writeFileSync(
    path.join(directory, 'native-pool.json'),
    JSON.stringify(pool) + '\n',
  )
  const scoped = classifyPool(pool, path.join(directory, 'wpt'))
  writeFileSync(
    path.join(directory, 'selector-pool.json'),
    JSON.stringify(scoped) + '\n',
  )
  writeNativeContract(
    directory,
    scoped,
    reports,
    runs.flatMap(run => run.files),
  )
  console.log(
    `Candidate native pool: ${pool.cases.length} passes. Selector/parser candidates: ${scoped.selected.cases.length}. Unresolved: ${scoped.totals['unresolved'] || 0}.`,
  )
}

if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      directory: { type: 'string' },
      analyze: { type: 'boolean' },
      resume: { type: 'boolean' },
    },
  })
  if ((values.analyze || values.resume) && !values.directory) {
    throw new Error('Replay and resume require --directory.')
  }
  if (values.analyze && values.resume) {
    throw new Error('Choose --analyze or --resume.')
  }
  const directory = values.directory
    ? path.resolve(values.directory)
    : mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-wpt-'))
  if (values.analyze) {
    analyzeNative(directory)
  } else {
    await runNative(directory, values.resume)
  }
}
