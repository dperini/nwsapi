import { defineConfig } from 'vitest/config'
import base from './vitest.config.mts'

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    setupFiles: [
      '.config/repo/vitest/unit-network.mts',
      '.config/repo/vitest/script-coverage.mts',
    ],
    coverage: {
      ...base.test?.coverage,
      enabled: true,
      include: ['scripts/**/*.{mts,mjs,js}'],
      exclude: [],
      reporter: ['json', 'json-summary'],
      reportsDirectory:
        process.env['NWSAPI_SCRIPT_COVERAGE_REPORT'] ?? 'coverage/scripts/node',
    },
  },
})
