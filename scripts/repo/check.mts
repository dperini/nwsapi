import { checkCode } from './check/run.mts'
import { isMainModule, runNode } from './lib/run-node.mts'
import { fileURLToPath } from 'node:url'
export { checkCode }
if (isMainModule(import.meta.url)) {
  runNode(
    fileURLToPath(new URL('./check/run.mts', import.meta.url)),
    process.argv.slice(2),
  )
}
