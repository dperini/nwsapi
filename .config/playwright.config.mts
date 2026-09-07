import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import { isAgent } from '../scripts/repo/lib/is-agent.mts'

// Vitest runs Node tests; this configuration only runs WPT in Chromium.
export default defineConfig({
  testDir: '../test/repo/e2e/upstream',
  outputDir: '../test-results',
  testMatch: 'wpt.spec.mts',
  fullyParallel: true,
  workers: process.env.WPT_UPDATE_EXPECTATIONS ? 1 : 4,
  reporter: isAgent() ? 'dot' : 'list',
  timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:8000', browserName: 'chromium' },
  webServer: {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    command: 'node scripts/repo/serve.mts',
    url: 'http://127.0.0.1:8000/resources/testharness.js',
    reuseExistingServer: false,
    env: { ...process.env, PORT: '8000' },
  },
})
