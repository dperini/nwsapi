import path from 'node:path'
import { fileURLToPath } from 'node:url'

import v8 from '@vitest/coverage-v8'
import type { BaseCoverageProvider } from 'vitest/node'

export function createV8CoverageModule(config: {
  readonly untransformedFiles: Iterable<string>
}) {
  const cfg = { __proto__: null, ...config }
  const untransformedFiles = new Set(
    Array.from(cfg.untransformedFiles, file => path.resolve(file)),
  )

  async function getProvider() {
    const { V8CoverageProvider } =
      await import('@vitest/coverage-v8/dist/provider.js')

    class SourceBytesCoverageProvider extends V8CoverageProvider {
      override transformFile(
        ...args: Parameters<BaseCoverageProvider['transformFile']>
      ) {
        const { 0: url, 1: project, 2: environment, 3: transformed } = args
        const file = url.startsWith('file:')
          ? fileURLToPath(url)
          : path.resolve(url)
        // Files executed outside Vite need their original offsets. Its SSR
        // transform can insert semicolons that move V8 coverage ranges.
        return super.transformFile(
          url,
          project,
          environment,
          untransformedFiles.has(file) ? false : transformed,
        )
      }
    }

    return new SourceBytesCoverageProvider()
  }

  return { __proto__: null, ...v8, getProvider }
}
