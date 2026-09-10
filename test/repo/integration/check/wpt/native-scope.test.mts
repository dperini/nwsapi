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
import { expect, test } from 'vitest'
import { classifyPool } from '../../../../../scripts/repo/check/wpt/native-scope.mts'
import { passingUniverse } from '../../../../../scripts/repo/check/wpt/native-pool.mts'

test('directory dependencies stay unresolved and modified upstream sources cannot be classified', t => {
  const checkout = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-scope-'))
  t.onTestFinished(() => rmSync(checkout, { recursive: true }))
  const file = path.join(checkout, 'case.html')
  writeFileSync(
    file,
    `<iframe src="dir/"></iframe><script>window.addEventListener('message', handler); register_unknown_tests();</script>`,
  )
  mkdirSync(path.join(checkout, 'dir'))
  writeFileSync(path.join(checkout, 'dir/.keep'), '')
  writeFileSync(
    path.join(checkout, 'MANIFEST.json'),
    JSON.stringify({
      items: { testharness: { 'case.html': ['blob', [null, {}]] } },
    }),
  )
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', checkout, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  git('init', '-q')
  git('add', '.')
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'Fixture',
  )
  const pins = { browser: '154', revision: git('rev-parse', 'HEAD') }
  const pool = passingUniverse(
    {
      ...pins,
      scope: 'selector-candidates',
      experimental: false,
      featurePolicy: 'browser-defaults',
      tests: [
        {
          test: '/case.html',
          subsuite: '',
          type: 'testharness',
          disabled: false,
        },
      ],
    },
    [
      {
        run_info: {
          browser_version: pins.browser,
          revision: pins.revision,
          product: 'chrome',
        },
        time_start: 1,
        time_end: 2,
        results: [
          {
            test: '/case.html',
            status: 'OK',
            subtests: [{ name: 'unknown case', status: 'PASS' }],
          },
        ],
      },
    ],
    pins,
  )
  const scoped = classifyPool(pool, checkout)
  expect(scoped.finalized).toBe(false)
  expect(scoped.totals).toEqual({ unresolved: 1 })
  expect(scoped.pages[0]!.groups[0]!.reason).toContain(
    'Unresolved dependency: dir/',
  )
  writeFileSync(file, readFileSync(file, 'utf8') + '<!-- changed -->')
  expect(() => classifyPool(pool, checkout)).toThrow('pristine sources')
})
