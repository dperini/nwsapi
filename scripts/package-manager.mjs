import { readFileSync } from 'node:fs'
import { packageManagerNotice } from './lib/package-manager.mjs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
const notice = packageManagerNotice(
  packageJson.version,
  process.env['npm_config_user_agent'],
)
if (notice) console.warn(notice)
