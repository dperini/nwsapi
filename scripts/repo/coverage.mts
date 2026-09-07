import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
} from './lib/coverage.mts'

const { createCoverageMap } = libCoverage
const { createContext } = libReport

const raw = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-wpt-coverage-'))
const run = (entry, args, env = process.env) =>
  execFileSync(process.execPath, [entry, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env,
  })
try {
  run('node_modules/vitest/vitest.mjs', [
    'run',
    '--config',
    '.config/vitest.config.mts',
    '--coverage',
  ])
  run(
    'node_modules/@playwright/test/cli.js',
    ['test', '--config', '.config/playwright.config.mts'],
    { ...process.env, WPT_COVERAGE_DIR: raw },
  )
  const coverage = createCoverageMap({})
  const engine = path.join(REPO_ROOT, 'src/nwsapi.js')
  for (let i = 0; i < manifest.length; i++) {
    const entries = JSON.parse(
      readFileSync(path.join(raw, `${i}.json`), 'utf8'),
    )
    if (!entries.length) {
      throw new Error(`Missing WPT coverage: ${manifest[i].path}`)
    }
    for (const entry of entries) {
      coverage.merge(
        await convert({
          code: entry.source,
          ast: parse(entry.source, { ecmaVersion: 'latest', locations: true }),
          coverage: { ...entry, url: pathToFileURL(engine).href },
          wrapperLength: 0,
        }),
      )
    }
  }
  const node = createCoverageMap(
    JSON.parse(
      readFileSync(
        path.join(REPO_ROOT, 'coverage/node/coverage-final.json'),
        'utf8',
      ),
    ),
  )
  const combined = combineCoverage(coverage, node, REPO_ROOT)
  const context = createContext({
    dir: path.join(REPO_ROOT, 'coverage'),
    coverageMap: combined,
  })
  for (const name of coverageReporters()) {
    reports.create(name).execute(context)
  }
  checkCoverageThresholds(combined.getCoverageSummary())
  run('scripts/repo/gen/coverage-badge.mts', [])
} finally {
  rmSync(raw, { recursive: true, force: true })
}
