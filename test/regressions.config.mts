import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  reporter: 'list',
  workers: 1,
  projects: [
    {
      name: 'chromium',
      testMatch: 'upstream/browser-agreement.spec.mts',
      use: { browserName: 'chromium' },
    },
  ],
})
