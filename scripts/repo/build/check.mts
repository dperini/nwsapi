import { message } from '@optique/core/message'
import { checkPackageManifest } from './manifest.mts'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { isMainModule } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'build:check',
      process.argv.slice(2),
      message`Check package build metadata.`,
    )
  ) {
    checkPackageManifest()
  }
}
