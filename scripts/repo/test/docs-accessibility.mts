import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'
import { once } from 'node:events'
import { REPO_ROOT } from '../lib/paths.mts'

const portServer = createServer()
portServer.listen(0, '127.0.0.1')
await once(portServer, 'listening')
const address = portServer.address()
if (!address || typeof address === 'string') {
  throw new Error('Could not allocate a local docs test port.')
}
const port = address.port
await new Promise<void>((resolve, reject) => {
  portServer.close(error => {
    if (error) {
      reject(error)
      return
    }
    resolve()
  })
})

const result = spawnSync(
  process.execPath,
  [
    'node_modules/@playwright/test/cli.js',
    'test',
    '--config',
    '.config/docs-accessibility.config.mts',
  ],
  {
    cwd: REPO_ROOT,
    env: { ...process.env, DOCS_A11Y_PORT: String(port) },
    stdio: 'inherit',
  },
)
if (result.error) {
  throw result.error
}
process.exitCode = result.status ?? 1
