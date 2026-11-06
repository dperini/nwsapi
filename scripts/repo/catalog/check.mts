import { message } from '@optique/core/message'
import { checkCatalog } from '../check/catalog.mts'
import { runHelpOnlyCli } from '../lib/cli/parser.mts'
import { isMainModule } from '../lib/run-node.mts'

if (isMainModule(import.meta.url)) {
  if (
    !runHelpOnlyCli(
      'catalog:check',
      process.argv.slice(2),
      message`Check package and workspace dependency catalogs.`,
    )
  ) {
    checkCatalog()
  }
}
