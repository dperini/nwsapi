import { expect, test, vi } from 'vitest'
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type * as RepoPaths from '../../../../scripts/repo/lib/paths.mts'
import type * as NodeRunner from '../../../../scripts/repo/lib/run-node.mts'

import { checkNaming } from '../../../../scripts/repo/naming/check.mts'

const state = vi.hoisted(() => ({
  root: '/tmp/nwsapi-naming-test-' + process.pid,
  main: false,
}))
vi.mock('../../../../scripts/repo/lib/paths.mts', async importOriginal => ({
  ...(await importOriginal<typeof RepoPaths>()),
  REPO_ROOT: state.root,
  SOURCE_DIR: path.join(state.root, 'src'),
  REPO_SCRIPT_DIR: path.join(state.root, 'scripts/repo'),
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', async importOriginal => ({
  ...(await importOriginal<typeof NodeRunner>()),
  isMainModule: (url: string) =>
    state.main && url.endsWith('/naming/check.mts'),
}))

test('default naming discovery visits nested source and script trees and ignores symlinks', async t => {
  t.onTestFinished(() => rmSync(state.root, { recursive: true, force: true }))
  mkdirSync(path.join(state.root, 'src/core/compile'), { recursive: true })
  mkdirSync(path.join(state.root, 'scripts/repo/tool'), { recursive: true })
  writeFileSync(path.join(state.root, 'src/core/compile/display.mts'), '')
  writeFileSync(path.join(state.root, 'scripts/repo/tool/run.mts'), '')
  symlinkSync('core', path.join(state.root, 'src/ignored'))
  expect(() => checkNaming()).not.toThrow()
  state.main = true
  try {
    vi.resetModules()
    await import('../../../../scripts/repo/naming/check.mts')
  } finally {
    state.main = false
  }
})

test('naming review detects prefix families whose destination already exists', () => {
  expect(() =>
    checkNaming([
      'src/core/compile-class.mts',
      'src/core/compile-id.mts',
      'src/core/compile-token.mts',
      'src/core/compile/class.mts',
    ]),
  ).toThrow()
})

test('accepts grouped source modules', () => {
  expect(() =>
    checkNaming([
      'src/core/compile/class.mts',
      'src/core/compile/id.mts',
      'src/core/compile/token.mts',
    ]),
  ).not.toThrow()
})

test('rejects an ungrouped source module family', () => {
  expect(() =>
    checkNaming([
      'src/core/compile-class.mts',
      'src/core/compile-id.mts',
      'src/core/compile-token.mts',
    ]),
  ).toThrow()
})

test('rejects a loose module even without a shared filename prefix', () => {
  expect(() => checkNaming(['src/core/factory.mts'])).toThrow()
})

test('rejects a module beside its category directory', () => {
  expect(() =>
    checkNaming([
      'src/core/compile/pseudo.mts',
      'src/core/compile/pseudo/display.mts',
    ]),
  ).toThrow()
})

test('rejects internal declaration files', () => {
  expect(() => checkNaming(['src/core/state/types.d.ts'])).toThrow()
})

test('rejects an ungrouped repository script family', () => {
  expect(() =>
    checkNaming([
      'scripts/repo/bench/query-browser.mts',
      'scripts/repo/bench/query-memory.mts',
      'scripts/repo/bench/query-timing.mts',
    ]),
  ).toThrow()
})
