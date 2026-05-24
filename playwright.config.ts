import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test_new/browser',
  testMatch: /.*\.test\.ts/,
  reporter: 'list',
});
