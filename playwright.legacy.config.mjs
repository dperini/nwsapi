import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/node',
  testMatch: 'legacy.spec.mjs',
  reporter: 'list',
  workers: 1,
});
