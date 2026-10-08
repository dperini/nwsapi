import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import type * as NodeFs from 'node:fs'
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } =
  await vi.importActual<typeof NodeFs>('node:fs')
const state = vi.hoisted(() => ({
  root: '',
  staging: false,
  legacy: false,
  missing: false,
  badFactory: false,
  formattingError: false,
  shape: 'array',
  execute: vi.fn(),
  write: vi.fn(),
  cleanup: vi.fn(),
}))
vi.mock('node:fs', async original => {
  const fs = await original<typeof NodeFs>()
  return {
    ...fs,
    mkdtempSync: () => state.root,
    mkdirSync: () => undefined,
    symlinkSync: () => undefined,
    existsSync: (file: string) =>
      file.endsWith('scripts/repo/build/package.mts')
        ? state.staging
        : file.endsWith('scripts/repo/build/run.mts')
          ? !state.legacy
          : !file.endsWith('missing.js'),
    readFileSync: (file: string, encoding?: string) => {
      if (file.endsWith('.tgz')) {
        return Buffer.from('archive')
      }
      const source = state.badFactory
        ? 'module.exports = {}'
        : '// ordinary\n//#region ../../fixture/node_modules/pkg\nmodule.exports = function engine() {}'
      return encoding ? source : Buffer.from(source)
    },
    writeFileSync: state.write,
    rmSync: state.cleanup,
  }
})
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
vi.mock('oxfmt', () => ({
  format: async (_file: string, source: string) => ({
    code: source,
    errors: state.formattingError ? [{ message: 'fixture' }] : [],
  }),
}))
vi.mock('../../../../scripts/repo/build/package.mts', () => ({
  packPackage: async () => ({ filename: 'candidate.tgz', files: [1, 2] }),
}))
vi.mock('../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  provenance: () => ({ fixture: true }),
  sha256: () => 'fixture',
  summarize: (values: number[]) => ({ count: values.length }),
  require: () => ({ version: 'fixture' }),
}))
const argv = process.argv.slice()
let temporary = ''
beforeEach(() => {
  vi.resetModules()
  temporary = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-size-test-'))
  state.root = temporary
  mkdirSync(path.join(temporary, 'baseline', '.config'), { recursive: true })
  state.staging = false
  state.legacy = false
  state.badFactory = false
  state.formattingError = false
  state.shape = 'array'
  state.write.mockClear()
  state.cleanup.mockClear()
  state.execute
    .mockReset()
    .mockImplementation((_command: string, args: string[]) => {
      if (args[0] === 'rev-parse') {
        return 'fixture\n'
      }
      if (args.includes('pack')) {
        const packed = { filename: 'baseline.tgz', files: [1, 2, 3] }
        return JSON.stringify(
          state.shape === 'array'
            ? [packed]
            : state.shape === 'wrapped'
              ? { nwsapi: packed }
              : { ...packed, entryCount: 4 },
        )
      }
      return Buffer.from('archive')
    })
  process.argv = [argv[0]!, 'build-compression.mts', '--baseline', 'fixture']
  vi.stubGlobal('gc', vi.fn())
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = argv
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  rmSync(temporary, { recursive: true, force: true })
})
async function run() {
  writeFileSync(
    path.join(temporary, 'baseline', '.config/build.config.mts'),
    `export const outputs=${JSON.stringify(state.legacy ? ['src/nwsapi.js', 'types.d.ts', 'missing.js'] : ['dist/nwsapi.js', 'types.d.ts', 'missing.js'])}`,
  )
  if (state.staging) {
    mkdirSync(path.join(temporary, 'baseline/scripts/repo/build'), {
      recursive: true,
    })
    writeFileSync(
      path.join(temporary, 'baseline/scripts/repo/build/package.mts'),
      "export async function packPackage(){return {filename:'baseline.tgz',entryCount:5}}",
    )
  }
  await import('../../../../scripts/repo/bench/build-compression.mts')
}
test.each(['array', 'wrapped', 'flat', 'staged'])(
  'measures paired built artifacts and package shape %s',
  async shape => {
    state.shape = shape
    state.staging = shape === 'staged'
    state.legacy = shape === 'flat'
    if (shape === 'wrapped') {
      vi.stubEnv('npm_execpath', '/fixture/npm.cjs')
    } else {
      vi.stubEnv('npm_execpath', '')
    }
    await run()
    const output = state.write.mock.calls.find(([file]) =>
      String(file).endsWith('build-compression.json'),
    )!
    const report = JSON.parse(output[1])
    expect(report.formatting.rows).toHaveLength(8)
    expect(
      report.initialization.rows.map(
        (row: { milliseconds: { count: number } }) => row.milliseconds.count,
      ),
    ).toEqual([7, 7])
    expect(report.packages.before.files).toBe(
      shape === 'staged' ? 5 : shape === 'flat' ? 4 : 3,
    )
    expect(report.packages.after.files).toBe(2)
    expect(report.core.after.bytes).toBeGreaterThan(0)
    expect(
      report.files.some((row: { before: unknown }) => row.before === null),
    ).toBe(true)
    expect(state.cleanup).toHaveBeenCalledOnce()
  },
)
test('relaunches with garbage collection enabled', async () => {
  vi.stubGlobal('gc', undefined)
  await run()
  expect(state.execute.mock.calls[0]![1]).toContain('--expose-gc')
  expect(state.write).not.toHaveBeenCalled()
})
test.each(['format', 'factory'])(
  'cleans temporary checkout after %s failure',
  async mode => {
    state.formattingError = mode === 'format'
    state.badFactory = mode === 'factory'
    await expect(run()).rejects.toBeInstanceOf(Error)
    expect(state.cleanup).toHaveBeenCalledOnce()
  },
)
test('requires baseline', async () => {
  process.argv = argv.slice(0, 1).concat('build-compression.mts')
  await expect(run()).rejects.toBeInstanceOf(Error)
})
test.each(['--help', '-h'])('help exits without building %s', async flag => {
  process.argv = argv.slice(0, 1).concat('build-compression.mts', flag)
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw Object.assign(new Error(), { code: 'EXIT' })
  })
  await expect(run()).rejects.toMatchObject({ code: 'EXIT' })
  expect(state.execute).not.toHaveBeenCalled()
})
