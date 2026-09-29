import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setupRelease } from './publish/setup.mjs'

setupRelease()
execFileSync(process.execPath, [fileURLToPath(new URL('../test/wpt/wpt-launcher.mjs', import.meta.url)), 'setup'], { stdio: 'inherit' })
