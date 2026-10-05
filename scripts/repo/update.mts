export {
  updateArgs,
  updateDependencies,
  updateReferences,
} from './dependency/update.mts'
import { fileURLToPath } from 'node:url'
import { isMainModule, runNode } from './lib/run-node.mts'
if (isMainModule(import.meta.url)) {
  runNode(
    fileURLToPath(new URL('./update/run.mts', import.meta.url)),
    process.argv.slice(2),
  )
}
