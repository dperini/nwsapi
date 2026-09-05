import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  reporter: 'list',
  workers: 1,
  projects: [
    { name: 'node', testMatch: 'node/jsdom.spec.mjs' },
    {
      name: 'chromium',
      testMatch: 'upstream/browser-agreement.spec.mjs',
      use: { browserName: 'chromium' }
    }
  ]
});
