import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import { browserLaunchOptions } from '../scripts/repo/browser.mts'
import { isAgent } from '../scripts/repo/lib/is-agent.mts'

const root = fileURLToPath(new URL('../', import.meta.url))
const port = Number(process.env['DOCS_A11Y_PORT'])
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(
    'DOCS_A11Y_PORT must be set by the docs accessibility runner.',
  )
}

export default defineConfig({
  testDir: '../test/repo/e2e/docs-accessibility',
  testMatch: 'docs.spec.mts',
  outputDir: '../.cache/docs-accessibility-results',
  reporter: isAgent() ? 'dot' : 'list',
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    launchOptions: browserLaunchOptions(),
  },
  webServer: {
    cwd: root,
    command: `node scripts/repo/run.mts node_modules/vite/bin/vite.js --config .config/model-guide.mts --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/index.html`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ...process.env, PORT: String(port) },
  },
})
