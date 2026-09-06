import { test, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO_ROOT } from '../scripts/lib/paths.mts'
import { toolingFiles } from '../scripts/lib/tooling-scope.mts'

test('the lint runner includes source, tests, scripts, and config', () => {
  const files = execFileSync(
    process.execPath,
    ['scripts/lint.mts', '--debug', 'files'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  )
    .trim()
    .split('\n')
  for (const file of [
    'src/nwsapi.mts',
    'src/dom-selector.mts',
    'src/modules/nwsapi-jquery.mts',
    'scripts/lint.mts',
    'scripts/gen/coverage-badge.mts',
    'test/lint-scope.test.mts',
    'test/jsdom-adapter-package.mts',
    'test/upstream/wpt.spec.mts',
    '.config/vitest.config.mts',
    '.config/runtime.d.ts',
  ]) {
    expect(files).toContain(file)
  }
  expect(
    files.some(file => file.endsWith('.js') || file.startsWith('upstream/')),
  ).toBe(false)
})

test('lint and format share a scope that excludes generated and upstream files', () => {
  const files = toolingFiles()
  expect(files).toContain('src/nwsapi.mts')
  expect(files).toContain('scripts/format.mts')
  expect(files).toContain('.config/runtime.d.ts')
  expect(files.every(file => !file.endsWith('.js'))).toBe(true)
  expect(files.some(file => file.startsWith('upstream/'))).toBe(false)
  expect(files.some(file => file.startsWith('test/upstream/fixtures/'))).toBe(
    false,
  )
})

test('lint requires literals for static regexes and allows dynamic patterns', t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-regex-style-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'regex-style.mts')
  const run = (input: string) => {
    writeFileSync(file, input)
    return spawnSync(
      process.execPath,
      [
        'node_modules/oxlint/bin/oxlint',
        '--config',
        '.config/oxlint.json',
        file,
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
  }
  const staticPattern = run("RegExp('^fixed$', 'i').test('fixed')")
  expect(staticPattern.status).not.toBe(0)
  expect(staticPattern.stdout + staticPattern.stderr).toContain(
    'prefer-regex-literals',
  )
  const dynamicPattern = run("RegExp(process.env.PATTERN, 'i').test('fixed')")
  expect(dynamicPattern.status).toBe(0)
})
