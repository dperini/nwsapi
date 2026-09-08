// Vitiate's supervised child auto-discovers this root config. The ordinary
// test suite explicitly uses .config/vitest.config.mts.
import { defineConfig } from 'vitest/config'
import { vitiatePlugin } from '@vitiate/core/plugin'
import { isAgent } from './scripts/repo/lib/is-agent.mts'

const minimalOutput = isAgent() && process.env['FUZZ_VERBOSE'] !== '1'

const budget = Number(process.env['FUZZ_TIME_MS'] ?? 15_000)
if (!Number.isSafeInteger(budget) || budget <= 0) {
  throw new Error('FUZZ_TIME_MS must be a positive integer.')
}

export default defineConfig({
  plugins: [
    {
      name: 'instrument-nwsapi-umd',
      enforce: 'pre',
      transform(code, id) {
        if (!id.replaceAll('\\', '/').endsWith('/src/nwsapi.js')) {
          return null
        }
        // Keep the shipped factory bytes unchanged inside an ESM wrapper, so
        // Vite instruments them instead of Node loading opaque CommonJS.
        return {
          code: `const module = { exports: {} }; const exports = module.exports;\n${code}\nexport default module.exports;`,
          map: null,
        }
      },
    },
    vitiatePlugin({
      instrument: { include: ['src/nwsapi.js'] },
      fuzz: {
        fuzzTimeMs: budget,
        maxLen: 512,
        stopOnCrash: true,
        quiet: minimalOutput,
      },
    }),
  ],
  test: {
    ...(minimalOutput
      ? {
          reporters: [
            'minimal' as const,
            ...(process.env['GITHUB_ACTIONS'] === 'true'
              ? ['github-actions' as const]
              : []),
          ],
        }
      : {}),
    include: ['test/repo/fuzz/**/*.fuzz.mts'],
    passWithNoTests: false,
    testTimeout: budget + 30_000,
    maxWorkers: 1,
    server: { deps: { inline: [/\/src\/nwsapi\.js$/] } },
  },
})
