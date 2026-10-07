import { expect, test, vi } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const transform = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => unknown>(() => ({ map: 'fixture' })),
)
vi.mock('@vitest/coverage-v8', () => ({
  default: { startCoverage: 'fixture-start' },
}))
vi.mock('@vitest/coverage-v8/dist/provider.js', () => ({
  V8CoverageProvider: class {
    transformFile(...args: unknown[]) {
      return transform(...args)
    }
  },
}))
import { createV8CoverageModule } from '../../../../scripts/fleet/cover/v8-provider.mts'

test('coverage of original bytes disables Vite transformations for file URLs and relative paths', async () => {
  const file = path.resolve('fixture/runtime.js')
  const module = createV8CoverageModule({
    untransformedFiles: ['fixture/runtime.js'],
  })
  const provider = await module.getProvider()
  const call = provider as unknown as {
    transformFile: (...args: unknown[]) => unknown
  }
  const project = { fixture: 'project' }
  const environment = { fixture: 'environment' }
  call.transformFile(pathToFileURL(file).href, project, environment, true)
  expect(transform).toHaveBeenLastCalledWith(
    pathToFileURL(file).href,
    project,
    environment,
    false,
  )
  call.transformFile('fixture/runtime.js', project, environment, true)
  expect(transform).toHaveBeenLastCalledWith(
    'fixture/runtime.js',
    project,
    environment,
    false,
  )
})

test('ordinary transformed modules retain their requested transformation mode', async () => {
  const module = createV8CoverageModule({ untransformedFiles: [] })
  const provider = await module.getProvider()
  const call = provider as unknown as {
    transformFile: (...args: unknown[]) => unknown
  }
  expect(
    call.transformFile('fixture/other.mts', undefined, 'ssr', true),
  ).toEqual({ map: 'fixture' })
  expect(transform).toHaveBeenLastCalledWith(
    'fixture/other.mts',
    undefined,
    'ssr',
    true,
  )
})
