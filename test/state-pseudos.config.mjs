import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './upstream',
  testMatch: 'state-pseudos.spec.mjs',
  reporter: 'list',
  workers: 1,
  use: { browserName: 'chromium' }
});
