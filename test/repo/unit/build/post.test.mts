import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  files: {} as Record<string, string>,
  write: vi.fn(),
  copy: vi.fn(),
  rm: vi.fn(),
  chmod: vi.fn(),
  hooks: vi.fn(),
  main: false,
}))
vi.mock('node:fs/promises', () => ({
  readFile: async (file: string) => state.files[file] ?? 'var fixture=1;',
  writeFile: state.write,
  copyFile: state.copy,
  rm: state.rm,
  chmod: state.chmod,
}))
vi.mock('node:module', () => ({ createRequire: () => () => ({ fixture: 1 }) }))
vi.mock('../../../../.config/build.config.mts', () => ({
  externalEntries: ['unicode'],
  outputs: [
    './dist/nwsapi.js',
    './dist/modules/nwsapi-legacy.js',
    './dist/non-js.txt',
  ],
  browserOutputs: new Set(['./dist/nwsapi.js']),
  obsoleteOutputs: ['./dist/old.js'],
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => state.main,
}))
vi.mock('../../../../scripts/repo/check/legacy-hooks.mts', () => ({
  checkLegacyHooks: state.hooks,
}))
vi.mock('../../../../scripts/repo/build/post/annotate-cjs-exports.mts', () => ({
  annotateCommonJsExports: () => '/* annotation */',
}))
vi.mock('../../../../scripts/repo/build/post/format.mts', () => ({
  formatOutput: async (_file: string, code: string) => code.trim() + '\n',
}))
beforeEach(() => {
  vi.resetModules()
  state.main = false
  state.files = {
    './package.json': JSON.stringify({
      version: '3.0.0',
      description: 'Fixture',
    }),
    './dist/nwsapi.js': 'var engine=1;',
    './dist/modules/nwsapi-legacy.js': 'var legacy=1;',
    './dist/external/unicode.js': 'var unicode=1;',
  }
  state.write.mockReset()
  state.write.mockImplementation(async (file: string, code: string) => {
    state.files[file] = code
  })
  state.copy.mockClear()
  state.hooks.mockClear()
})
test('post processing is idempotent and validates browser syntax and legacy hooks', async () => {
  const { postBuild } = await import('../../../../scripts/repo/build/post.mts')
  await postBuild()
  expect(state.copy).toHaveBeenCalledOnce()
  expect(state.hooks).toHaveBeenCalledOnce()
  expect(state.chmod).toHaveBeenCalledWith('./dist/bin/nwsapi.js', 0o755)
  state.write.mockClear()
  await postBuild()
  expect(state.write).not.toHaveBeenCalled()
})
test('direct invocation runs post processing', async () => {
  state.main = true
  await import('../../../../scripts/repo/build/post.mts')
  expect(state.hooks).toHaveBeenCalledOnce()
})
