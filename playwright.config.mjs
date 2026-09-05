import process from 'node:process';
import { defineConfig } from '@playwright/test';

// Node tests use node:test and never load this WPT-only configuration.
export default defineConfig({
  testDir: 'test/upstream',
  testMatch: 'wpt.spec.mjs',
  fullyParallel: true,
  workers: process.env.WPT_UPDATE_EXPECTATIONS ? 1 : 4,
  reporter: 'list',
  timeout: 90_000,
  use: { baseURL: 'http://127.0.0.1:8000', browserName: 'chromium' },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://127.0.0.1:8000/resources/testharness.js',
    reuseExistingServer: false,
    env: { ...process.env, PORT: '8000' },
  },
});
