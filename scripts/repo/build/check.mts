import { checkPackageManifest } from './manifest.mts'
import { isMainModule } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run build:check')
  } else {
    checkPackageManifest()
  }
}
