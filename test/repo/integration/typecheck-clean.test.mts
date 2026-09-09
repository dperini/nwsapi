import { test, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'

test('local CI selects the workflow explicitly on feature branches', () => {
  const pkg = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
  )
  const args = pkg.scripts['ci:local'].split(' ')
  const workflowIndex = args.indexOf('--workflow')
  expect(workflowIndex).toBeGreaterThan(0)
  expect(args[workflowIndex + 1]).toBe('.github/workflows/node.js.yml')
  expect(existsSync(path.join(REPO_ROOT, args[workflowIndex + 1]))).toBe(true)
})

test('type and lint checks pass without build outputs or an incremental cache', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-typecheck-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const files = globSync(
    [
      'bin/**/*.mts',
      'src/**/*.mts',
      'src/external/*.js',
      'src/**/*.d.ts',
      'scripts/**/*.mts',
      'test/repo/**/*.mts',
      '.config/*.mts',
      '.config/repo/**/*.mts',
      '.config/*.d.ts',
      '.config/*.json',
      'package.json',
    ],
    { cwd: REPO_ROOT },
  )
  for (const file of files) {
    const destination = path.join(root, file)
    mkdirSync(path.dirname(destination), { recursive: true })
    copyFileSync(path.join(REPO_ROOT, file), destination)
  }
  symlinkSync(
    realpathSync(path.join(REPO_ROOT, 'node_modules')),
    path.join(root, 'node_modules'),
    'junction',
  )
  expect(existsSync(path.join(root, 'dist/nwsapi.js'))).toBe(false)
  expect(existsSync(path.join(root, '.cache'))).toBe(false)
  execFileSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--incremental',
      'false',
      '-p',
      '.config/tsconfig.check.json',
    ],
    { cwd: root, stdio: 'pipe' },
  )
  const lint = spawnSync(process.execPath, ['scripts/repo/lint.mts'], {
    cwd: root,
    encoding: 'utf8',
  })
  expect(lint.status, lint.stdout + lint.stderr).toBe(0)
})
