import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { convert } from 'ast-v8-to-istanbul'
import { parse } from 'acorn'
import libCoverage from 'istanbul-lib-coverage'
import libReport from 'istanbul-lib-report'
import reports from 'istanbul-reports'
import { manifest } from '../../test/repo/e2e/upstream/manifest.mts'
import { REPO_ROOT } from './lib/paths.mts'
import {
  combineCoverage,
  coverageReporters,
  checkCoverageThresholds,
} from './lib/coverage/report.mts'

import {
  runTypeCoverage,
  checkTypeCoverage,
  writeTypeCoverage,
  accumulatedCoverage,
} from './lib/type-coverage.mts'

const { createCoverageMap } = libCoverage
const { createContext } = libReport

const { values } = parseArgs({ options: { workers: { type: 'string' } } })
const testArgs = ['all', '--coverage']
if (values.workers !== undefined) {
  if (!/^[1-9]\d*$/.test(values.workers)) {
    throw new Error('--workers must be a positive integer')
  }
  testArgs.push('--maxWorkers', values.workers)
}

const raw = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-wpt-coverage-'))
const run = (entry: string, args: string[], env = process.env) =>
  execFileSync(process.execPath, [entry, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env,
  })
try {
  const types = runTypeCoverage(REPO_ROOT)
  writeTypeCoverage(REPO_ROOT, types)
  checkTypeCoverage(types)
  run('scripts/repo/test.mts', testArgs)
  const coverage = createCoverageMap({})
  const engine = path.join(REPO_ROOT, 'dist/nwsapi.js')
  for (const mode of ['modern', 'legacy']) {
    const directory = path.join(raw, mode)
    mkdirSync(directory)
    run('scripts/repo/test.mts', ['upstream'], {
      ...process.env,
      NWSAPI_LEGACY: mode === 'legacy' ? '1' : '0',
      WPT_COVERAGE_DIR: directory,
    })
    for (let i = 0; i < manifest.length; i++) {
      const entries = JSON.parse(
        readFileSync(path.join(directory, `${i}.json`), 'utf8'),
      )
      if (!entries.length) {
        throw new Error(`Missing WPT coverage: ${manifest[i]!.path}`)
      }
      for (const entry of entries) {
        coverage.merge(
          await convert({
            code: entry.source,
            ast: parse(entry.source, {
              ecmaVersion: 'latest',
              locations: true,
            }),
            coverage: { ...entry, url: pathToFileURL(engine).href },
            wrapperLength: 0,
          }),
        )
      }
    }
  }
  const node = createCoverageMap({})
  for (const tier of ['unit', 'integration']) {
    node.merge(
      JSON.parse(
        readFileSync(
          path.join(REPO_ROOT, `coverage/${tier}/coverage-final.json`),
          'utf8',
        ),
      ),
    )
  }
  const combined = combineCoverage(coverage, node, REPO_ROOT)
  const context = createContext({
    dir: path.join(REPO_ROOT, 'coverage'),
    coverageMap: combined,
  })
  for (const name of coverageReporters()) {
    reports.create(name).execute(context)
  }
  const execution = combined.getCoverageSummary()
  writeFileSync(
    path.join(REPO_ROOT, 'coverage/coverage-aggregate.json'),
    JSON.stringify(accumulatedCoverage(execution.toJSON(), types), null, 2) +
      '\n',
  )
  console.log(
    `Accumulated coverage: execution ${execution.lines.pct}% lines; types ${types.pct}% identifiers`,
  )
  checkCoverageThresholds(execution)
  run('scripts/repo/gen/coverage-badge.mts', [])
} finally {
  rmSync(raw, { recursive: true, force: true })
}
