import { test, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'
import { toolingFiles } from '../../../scripts/repo/lib/tooling-scope.mts'

test('the lint runner includes source, tests, scripts, and config', () => {
  const files = execFileSync(
    process.execPath,
    ['scripts/repo/lint.mts', '--debug', 'files'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, AI_AGENT: '1' },
    },
  )
    .trim()
    .split('\n')
  for (const file of [
    'src/bin/nwsapi.mts',
    'src/core/nwsapi.mts',
    'src/external/unicode.js',
    'src/external/unicode.d.ts',
    'src/adapter/dom-selector.mts',
    'src/extension/jquery.mts',
    'scripts/repo/lint.mts',
    'scripts/repo/gen/coverage-badge.mts',
    'test/repo/integration/lint-scope.test.mts',
    'test/repo/e2e/jsdom-adapter-package.mts',
    'test/repo/e2e/upstream/wpt.spec.mts',
    '.config/repo/vitest.config.mts',
    '.config/runtime.d.ts',
  ] as const) {
    expect(files).toContain(file)
  }
  expect(
    files.some(
      file =>
        (file.endsWith('.js') && !file.startsWith('src/external/')) ||
        file.startsWith('upstream/'),
    ),
  ).toBe(false)
})

test('lint and format share a scope that excludes generated and upstream files', () => {
  const files = toolingFiles()
  expect(files).toContain('src/core/nwsapi.mts')
  expect(files).toContain('scripts/repo/format.mts')
  expect(files).toContain('.config/runtime.d.ts')
  expect(files).toContain('src/external/unicode.js')
  expect(files).toContain('src/external/unicode.d.ts')
  expect(files).not.toContain('dist/nwsapi.js')
  expect(files).not.toContain('dist/external/unicode.js')
  expect(files.some(file => file.startsWith('upstream/'))).toBe(false)
  expect(files).toContain('test/repo/e2e/fixture/upstream/switch-idl.mts')
  expect(files).not.toContain(
    'test/repo/e2e/fixture/upstream/wrapper-arguments.html',
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
  const dynamicPattern = run(
    "RegExp(process.env['PATTERN'], 'i').test('fixed')",
  )
  expect(dynamicPattern.status).toBe(0)
})
