import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { parseExpressionAt } from 'acorn'
import { runInNewContext } from 'node:vm'
import {
  moduleSpecifier,
  relocateImports,
} from '../../../../scripts/repo/build/package.mts'

test.each([
  ['require("./core.js")', './core.js'],
  ['import("./core.js")', './core.js'],
  ['require(variable)', undefined],
  ['require("a", "b")', undefined],
  ['loader("a")', undefined],
  ['"./core.js"', undefined],
])('recognizes literal module specifiers in %s', (source, expected) => {
  const node = parseExpressionAt(source, 0, { ecmaVersion: 'latest' })
  expect(moduleSpecifier(node)?.value).toBe(expected)
})

test('relocates runtime imports while preserving dependencies and ordinary strings', () => {
  const calls: string[] = []
  const result = runInNewContext(
    relocateImports(
      `require('../nwsapi.js');
       require('../external/unicode.js');
       require('css-tree');
       require('./unmapped.js');
       '../nwsapi.js'`,
      'dist/bin/nwsapi.js',
      'bin/nwsapi.js',
    ),
    { require: (specifier: string) => calls.push(specifier) },
  )
  expect(calls).toEqual([
    '../src/nwsapi.js',
    '../dist/external/unicode.js',
    'css-tree',
    './unmapped.js',
  ])
  expect(result).toBe('../nwsapi.js')
})

test('relocates dynamic imports using the same file mapping', () => {
  const result = relocateImports(
    'import("./adapter/dom-selector.js")',
    'dist/nwsapi.js',
    'src/nwsapi.js',
  )
  expect(
    moduleSpecifier(parseExpressionAt(result, 0, { ecmaVersion: 'latest' }))
      ?.value,
  ).toBe('./dom-selector.js')
})

const state = vi.hoisted(() => ({
  response: '',
  fail: false,
  main: false,
  rm: vi.fn(),
  exec: vi.fn(),
  assert: vi.fn(),
}))
vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  mkdtemp: async () => '/fixture-staging',
  readFile: async () => {
    if (state.fail) {
      throw new Error('read failed')
    }
    return 'var value=1;'
  },
  rm: state.rm,
  writeFile: vi.fn(),
}))
vi.mock('node:child_process', () => ({ execFileSync: state.exec }))
vi.mock('../../../../scripts/repo/build/manifest.mts', () => ({
  publishedManifest: () => ({ name: 'nwsapi' }),
  checkPackageManifest: () => ({}),
  assertPackageFiles: state.assert,
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
beforeEach(() => {
  vi.resetModules()
  state.fail = false
  state.main = false
  state.exec.mockReset()
  state.exec.mockImplementation(() => state.response)
  state.rm.mockClear()
  state.assert.mockClear()
})
afterEach(() => vi.unstubAllEnvs())
test.each([
  { response: [{ files: [] }], cli: undefined },
  { response: { nwsapi: { files: [] } }, cli: '/cli.cjs' },
  { response: { files: [] }, cli: '/manager' },
])('packs supported manager response shapes %#', async ({ response, cli }) => {
  state.response = JSON.stringify(response)
  vi.stubEnv('npm_execpath', cli)
  const { packPackage } =
    await import('../../../../scripts/repo/build/package.mts')
  expect(await packPackage('/destination')).toEqual({ files: [] })
  expect(state.assert).toHaveBeenCalledWith([])
  expect(state.rm).toHaveBeenCalledWith('/fixture-staging', {
    recursive: true,
    force: true,
  })
  expect(state.exec.mock.calls[0]?.[0]).toBe(
    cli === '/cli.cjs' ? process.execPath : (cli ?? 'pnpm'),
  )
})
test('failed staging removes the incomplete package directory', async () => {
  state.fail = true
  const { stagePackage } =
    await import('../../../../scripts/repo/build/package.mts')
  await expect(stagePackage()).rejects.toThrow()
  expect(state.rm).toHaveBeenCalledOnce()
})
test('CLI packing prints the packed manifest', async () => {
  state.main = true
  state.response = JSON.stringify({ files: [] })
  const args = process.argv
  process.argv = [
    args[0]!,
    '/build/package.mts',
    '--pack-destination',
    '/destination',
  ]
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await import('../../../../scripts/repo/build/package.mts')
    expect(JSON.parse(log.mock.calls[0]?.[0] as string)).toEqual({ files: [] })
  } finally {
    process.argv = args
  }
})
