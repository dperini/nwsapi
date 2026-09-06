import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

process.env.TZ ??= 'UTC'

export default defineConfig({
  server: { watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === '1' } },
  test: {
    watch: process.argv.includes('--watch'),
    include: ['test/*.test.mts'],
    globalSetup: ['.config/vitest.setup.mts'],
    forceRerunTriggers: ['../src/**/*.mts', '../scripts/build.mts', './**'].map(
      path => fileURLToPath(new URL(path, import.meta.url)),
    ),
    environment: 'node',
    pool: 'forks',
    isolate: true,
    maxWorkers: 4,
    restoreMocks: true,
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/*.js'],
      reporter: ['text', 'html'],
    },
  },
})
