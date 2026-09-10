import { browserLaunchOptions } from '../scripts/repo/browser.mts'
import { defineConfig } from '@playwright/test'
import { isAgent } from '../scripts/repo/lib/is-agent.mts'

export default defineConfig({
  testDir: '../test/repo/e2e/upstream',
  testMatch: 'state-pseudos.spec.mts',
  reporter: isAgent() ? 'dot' : 'list',
  workers: 1,
  use: { browserName: 'chromium', launchOptions: browserLaunchOptions() },
})
