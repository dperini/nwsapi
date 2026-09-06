import process from 'node:process'
import { defineConfig } from '@playwright/test'

// Vitest runs Node tests; this configuration only runs WPT in Chromium.
export default defineConfig({
  testDir: 'test/upstream',
  testMatch: 'wpt.spec.mts',
  fullyParallel: true,
  workers: process.env.WPT_UPDATE_EXPECTATIONS ? 1 : 4,
  reporter: 'list',
  timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:8000', browserName: 'chromium' },
  webServer: {
    command: 'node scripts/serve.mts',
    url: 'http://127.0.0.1:8000/resources/testharness.js',
    reuseExistingServer: false,
    env: { ...process.env, PORT: '8000' },
  },
})
