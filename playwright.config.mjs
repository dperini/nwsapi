import process from 'node:process';
import { defineConfig } from '@playwright/test';

/*
 * Playwright harness for running upstream WPT selector tests against this
 * repo's src/nwsapi.js (see test/upstream/README.md).
 *
 * The webServer serves the pinned WPT checkout (upstream/wpt) from "/" so
 * WPT's root-absolute resource paths resolve; scripts/serve.mjs respects
 * the PORT env var, and reuseExistingServer lets a manually started server
 * (e.g. via portless) be picked up instead.
 */
export default defineConfig({
  testDir: 'test/upstream',
  testMatch: '*.spec.mjs',
  fullyParallel: true,
  // Baseline rewrites (wpt.spec.mjs read-modify-writes expectations.json per
  // file) are not atomic across processes: force a single worker.
  ...(process.env.WPT_UPDATE_EXPECTATIONS ? { workers: 1 } : {}),
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:8000',
  },
  projects: [
    {
      name: 'upstream',
      use: { browserName: 'chromium' },
    },
    // Only chromium binaries are installed right now. When firefox/webkit
    // are available, add projects here:
    // { name: 'upstream-firefox', use: { browserName: 'firefox' } },
    // { name: 'upstream-webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'node scripts/serve.mjs',
    port: 8000,
    reuseExistingServer: true,
    env: { ...process.env, PORT: '8000' },
  },
});
