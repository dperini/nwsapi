import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { isAgent } from '../scripts/repo/lib/is-agent.mts'

process.env['TZ'] ??= 'UTC'

export default defineConfig({
  server: { watch: { usePolling: process.env['CHOKIDAR_USEPOLLING'] === '1' } },
  test: {
    ...(isAgent()
      ? {
          reporters: [
            'minimal' as const,
            ...(process.env['GITHUB_ACTIONS'] === 'true'
              ? ['github-actions' as const]
              : []),
          ],
        }
      : {}),
    watch: process.argv.includes('--watch'),
    include: [
      process.env['NWSAPI_TEST_TIER'] === 'unit'
        ? 'test/repo/unit/**/*.test.mts'
        : process.env['NWSAPI_TEST_TIER'] === 'integration'
          ? 'test/repo/integration/**/*.test.mts'
          : 'test/repo/**/*.test.mts',
    ],
    globalSetup: ['.config/vitest.setup.mts'],
    forceRerunTriggers: [
      '../src/**/*.mts',
      '../scripts/repo/build/run.mts',
      './**',
    ].map(path => fileURLToPath(new URL(path, import.meta.url))),
    environment: 'node',
    // Execute the published CommonJS bytes consistently for import and require.
    server: { deps: { external: [/\/dist\/.*\.js$/] } },
    pool: process.env['NWSAPI_TEST_TIER'] === 'unit' ? 'threads' : 'forks',
    // Unit fixtures own their DOM instances; subprocess suites stay isolated.
    isolate: process.env['NWSAPI_TEST_TIER'] !== 'unit',
    // Shared unit workers amortize jsdom startup; more workers duplicate it.
    maxWorkers: process.env['NWSAPI_TEST_TIER'] === 'unit' ? 2 : 4,
    restoreMocks: true,
    testTimeout: 10_000,
    coverage: {
      provider: 'custom',
      customProviderModule: '.config/repo/vitest/coverage.mts',
      include: ['dist/nwsapi.js', 'dist/dom-selector.js', 'dist/modules/*.js'],
      // External data is exercised in the embedded engine, not its build wrapper.
      exclude: ['dist/external/**'],
      reportsDirectory: 'coverage/node',
      reporter: ['text', 'json', 'json-summary'],
    },
  },
})
