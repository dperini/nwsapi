import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  badChunk: '',
  missing: '',
  transformErrors: false,
  build: vi.fn(),
  write: vi.fn(),
  post: vi.fn(),
  lower: vi.fn(async (code: string) => code),
  engine: vi.fn(async (code: string) => code),
}))
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: state.write,
  readFile: async (file: string) => {
    if (file === 'src/extension/legacy/register.mts') {
      return state.missing === 'attributes'
        ? 'const x=1'
        : 'const attrs=/* @bundle:legacy-attributes */ {}'
    }
    if (file === 'src/core/initialize/load.mts') {
      return (
        (state.missing === 'core'
          ? 'const core={}'
          : 'const core=/* @bundle:core */ {}') +
        ';' +
        (state.missing === 'direction'
          ? 'const direction={}'
          : 'const direction=/* @bundle:direction */ {}')
      )
    }
    return 'const other=1'
  },
}))
vi.mock('rolldown', () => ({ build: state.build }))
vi.mock('rolldown/utils', () => ({
  transform: async (_file: string, source: string) => ({
    code: source,
    errors: state.transformErrors ? [{ message: 'invalid' }] : [],
  }),
}))
vi.mock('../../../../.config/build.config.mts', () => ({
  externalEntries: ['unicode'],
  browserOutputs: new Set(['dist/nwsapi.js']),
  entries: [
    { source: 'src/bin/nwsapi.mts', output: 'dist/bin/nwsapi.js' },
    {
      source: 'src/adapter/dom-selector.mts',
      output: 'dist/adapter/dom-selector.js',
    },
    {
      source: 'src/extension/legacy/register.mts',
      output: 'dist/modules/nwsapi-legacy.js',
    },
    { source: 'src/core/initialize/load.mts', output: 'dist/nwsapi.js' },
    { source: 'src/other.mts', output: 'dist/other.js' },
  ],
}))
vi.mock('../../../../.config/repo/rolldown/external-loaders.mts', () => ({
  externalLoaderPlugin: () => ({ name: 'fixture' }),
}))
vi.mock('../../../../scripts/repo/unicode-es5/check.mts', () => ({
  checkUnicodeEs5: vi.fn(),
}))
vi.mock('../../../../scripts/repo/rolldown/engine.mts', () => ({
  bundleEngine: state.engine,
}))
vi.mock('../../../../scripts/repo/build/post.mts', () => ({
  postBuild: state.post,
}))
vi.mock('../../../../scripts/repo/build/post/es5.mts', () => ({
  lowerToEs5: state.lower,
}))
beforeEach(() => {
  vi.resetModules()
  state.badChunk = ''
  state.missing = ''
  state.transformErrors = false
  state.build.mockReset()
  state.build.mockImplementation(async ({ input }: { input: string }) => ({
    output:
      input === state.badChunk
        ? []
        : [{ type: 'chunk', code: 'var fixture={}' }],
  }))
  state.write.mockClear()
  state.post.mockClear()
})
test('bundles registered runtime entries and runs production post processing', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await import('../../../../scripts/repo/build/run.mts')
  expect(state.write).toHaveBeenCalledTimes(3)
  expect(state.post).toHaveBeenCalledOnce()
  expect(state.engine).toHaveBeenCalled()
  expect(state.lower).toHaveBeenCalled()
})
test.each([
  './src/core/unicode/direction.mts',
  './src/extension/legacy/attributes.mts',
  './src/core/initialize/factory.mts',
])('rejects missing bundle output for %s', async input => {
  state.badChunk = input
  await expect(
    import('../../../../scripts/repo/build/run.mts'),
  ).rejects.toThrow()
  expect(state.post).not.toHaveBeenCalled()
})
test.each(['attributes', 'core', 'direction'])(
  'rejects missing %s bundle marker',
  async missing => {
    state.missing = missing
    await expect(
      import('../../../../scripts/repo/build/run.mts'),
    ).rejects.toThrow()
  },
)
test('rejects TypeScript transform errors', async () => {
  state.transformErrors = true
  await expect(
    import('../../../../scripts/repo/build/run.mts'),
  ).rejects.toThrow()
})
