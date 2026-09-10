import { createHash } from 'node:crypto'
import { globSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { writeNativeSummaryDocumentation } from '../../gen/wpt-native-summary.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import { isMainModule } from '../../lib/run-node.mts'
import {
  nativePins,
  type NativePins,
  type NativeReport,
} from './native-pool.mts'
import type { classifyPool } from './native-scope.mts'

type Scope = ReturnType<typeof classifyPool>
export const nativeCachePath = path.join(
  os.tmpdir(),
  'nwsapi-native-wpt-latest.json',
)
const artifactRoot = path.join(REPO_ROOT, 'assets/repo/bench')
const summaryPath = path.join(artifactRoot, 'wpt-native-summary.json')
const supportPath = path.join(artifactRoot, 'wpt-native-support.json')
const categoriesPath = path.join(artifactRoot, 'wpt-native-categories.json')
const digest = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex')

export function inferenceDigest() {
  const files = globSync('scripts/repo/check/wpt/native-*.mts', {
    cwd: REPO_ROOT,
  }).toSorted()
  files.push(
    'scripts/repo/check/wpt/source.mts',
    'scripts/repo/check/wpt/source-ast.mts',
    'scripts/repo/check/wpt/scope.mts',
    'scripts/repo/check/wpt/inventory.mts',
    'pnpm-lock.yaml',
  )
  return digest(
    files
      .map(
        file => file + '\0' + digest(readFileSync(path.join(REPO_ROOT, file))),
      )
      .join('\n'),
  )
}

export function assertFinalized(
  totals: Record<string, number>,
  nativePassing: number,
  selected: number,
) {
  if (
    totals['unresolved'] ||
    Object.keys(totals).some(
      category =>
        ![
          'unresolved',
          'selector-parsing',
          'selector-matching',
          'mixed-selector',
          'rendering',
          'css-values',
          'other-api',
        ].includes(category),
    ) ||
    Object.values(totals).some(
      count => !Number.isSafeInteger(count) || count < 0,
    )
  ) {
    throw new Error(
      'Native support pool is not finalized. Resolve every scope decision before publishing it.',
    )
  }
  if (
    Object.values(totals).reduce((sum, count) => sum + count, 0) !==
    nativePassing
  ) {
    throw new Error(
      'Native classification counts do not cover the passing pool exactly once.',
    )
  }
  const eligible = [
    'selector-parsing',
    'selector-matching',
    'mixed-selector',
  ].reduce((sum, category) => sum + (totals[category] || 0), 0)
  if (!selected || selected !== eligible) {
    throw new Error(
      'Native support cases do not match the eligible category counts.',
    )
  }
}

export function writeNativeContract(
  directory: string,
  scoped: Scope,
  reports: NativeReport[],
  inputFiles = ['plan.json', 'report.json'],
) {
  const report = reports[0]!
  const pool = scoped.selected
  assertFinalized(scoped.totals, pool.nativePassing, pool.cases.length)
  const support =
    JSON.stringify({
      browser: pool.browser,
      revision: pool.revision,
      scope: pool.scope,
      cases: pool.cases,
    }) + '\n'
  const categories =
    JSON.stringify({
      browser: pool.browser,
      revision: pool.revision,
      totals: scoped.totals,
      pages: scoped.pages,
    }) + '\n'
  const summary = {
    schema: 1,
    browser: pool.browser,
    revision: pool.revision,
    finalized: true,
    inference: inferenceDigest(),
    durationMs: reports.reduce(
      (sum, run) => sum + run.time_end - run.time_start,
      0,
    ),
    runs: reports.length,
    processes: 4,
    platform: report.run_info.os || 'unknown',
    arch: report.run_info.processor || 'unknown',
    planned: pool.planned + pool.disabled,
    observed: pool.observed,
    disabled: pool.disabled,
    nativePassing: pool.nativePassing,
    selected: pool.cases.length,
    selectedPages: new Set(pool.cases.map(entry => entry.test)).size,
    totals: scoped.totals,
    supportSha256: digest(support),
    categoriesSha256: digest(categories),
    inputs: [...inputFiles, 'discovery.json'].map(file => ({
      file,
      sha256: digest(readFileSync(path.join(directory, file))),
    })),
  }
  writeFileSync(supportPath, support)
  writeFileSync(categoriesPath, categories)
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n')
  writeNativeSummaryDocumentation(summary)
  writeFileSync(
    nativeCachePath,
    JSON.stringify({
      directory,
      browser: pool.browser,
      revision: pool.revision,
    }) + '\n',
  )
  return summary
}

export function checkNativeContract(pins: NativePins = nativePins()) {
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
  if (
    summary.browser !== pins.browser ||
    summary.revision !== pins.revision ||
    summary.inference !== inferenceDigest()
  ) {
    throw new Error(
      'Native support pool is stale. After pin changes, run pnpm run test:wpt:native. After inference changes, rerun saved results with --analyze --directory <directory>.',
    )
  }
  if (
    !summary.finalized ||
    digest(readFileSync(supportPath)) !== summary.supportSha256 ||
    digest(readFileSync(categoriesPath)) !== summary.categoriesSha256
  ) {
    throw new Error(
      'Native support artifacts changed or are incomplete. Regenerate them from the recorded native run.',
    )
  }
  assertFinalized(summary.totals, summary.nativePassing, summary.selected)
  console.log(
    `Native selector contract: ${summary.selected} cases across ${summary.selectedPages} URLs at Chrome ${pins.browser}.`,
  )
}

if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({ options: { check: { type: 'boolean' } } })
  if (!values.check) {
    throw new Error('Usage: native-contract.mts --check')
  }
  checkNativeContract()
}
