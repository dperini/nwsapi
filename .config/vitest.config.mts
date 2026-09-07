import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { isAgent } from '../scripts/repo/lib/is-agent.mts'

process.env.TZ ??= 'UTC'

export default defineConfig({
  server: { watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === '1' } },
  test: {
    reporters: isAgent()
      ? [
          'minimal',
          ...(process.env.GITHUB_ACTIONS === 'true'
            ? ['github-actions' as const]
            : []),
        ]
      : undefined,
    watch: process.argv.includes('--watch'),
    include: ['test/repo/**/*.test.mts'],
    globalSetup: ['.config/vitest.setup.mts'],
    forceRerunTriggers: [
      '../src/**/*.mts',
      '../scripts/repo/build.mts',
      './**',
    ].map(path => fileURLToPath(new URL(path, import.meta.url))),
    environment: 'node',
    pool: 'forks',
    isolate: true,
    maxWorkers: 4,
    restoreMocks: true,
    testTimeout: 10_000,
    coverage: {
      provider: 'v8',
      include: ['src/*.js'],
      reportsDirectory: 'coverage/node',
      reporter: ['text', 'json', 'json-summary'],
    },
  },
})
