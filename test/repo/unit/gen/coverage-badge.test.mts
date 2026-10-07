import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import type * as Paths from '../../../../scripts/repo/lib/paths.mts'
import { makeCoverageBadge } from '../../../../scripts/repo/gen/coverage-badge.mts'

test('missing README fails without creating an asset', t => {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-badge-empty-'))
  t.onTestFinished(() => rmSync(repoRoot, { recursive: true, force: true }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(makeCoverageBadge({ repoRoot })).toBe(1)
})
test.each([
  { args: [], code: 0 },
  { args: ['--invalid'], code: 1 },
])('CLI handles argument set $args', async ({ args, code }) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-badge-cli-'))
  mkdirSync(path.join(root, 'coverage'))
  writeFileSync(
    path.join(root, 'README.md'),
    '![Coverage](assets/repo/coverage.svg)',
  )
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ private: true }),
  )
  writeFileSync(
    path.join(root, 'coverage/coverage-summary.json'),
    JSON.stringify({ total: { lines: { pct: 99 } } }),
  )
  const manager = {
    argv: [
      'node',
      path.resolve('scripts/repo/gen/coverage-badge.mts'),
      ...args,
    ],
    exitCode: 0,
  }
  const actual = await vi.importActual<typeof Paths>(
    '../../../../scripts/repo/lib/paths.mts',
  )
  vi.resetModules()
  vi.doMock('node:process', () => ({ default: manager }))
  vi.doMock('../../../../scripts/repo/lib/paths.mts', () => ({
    ...actual,
    REPO_ROOT: root,
    COVERAGE_SUMMARY_PATH: path.join(root, 'coverage/coverage-summary.json'),
  }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const module =
      await import('../../../../scripts/repo/gen/coverage-badge.mts')
    expect(manager.exitCode).toBe(code)
    if (!code) {
      const dom = new JSDOM(
        readFileSync(path.join(root, 'assets/repo/coverage.svg'), 'utf8'),
        { contentType: 'image/svg+xml' },
      )
      expect(dom.window.document.documentElement.getAttribute('role')).toBe(
        'img',
      )
      dom.window.close()
      expect(module.makeCoverageBadge({ repoRoot: root })).toBe(0)
    }
  } finally {
    vi.doUnmock('node:process')
    vi.doUnmock('../../../../scripts/repo/lib/paths.mts')
    rmSync(root, { recursive: true, force: true })
  }
})
