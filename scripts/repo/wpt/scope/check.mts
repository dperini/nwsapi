import { fileURLToPath } from 'node:url'
import { isMainModule, runNode } from '../../lib/run-node.mts'
export * from '../../check/wpt/scope.mts'
export { default } from '../../check/wpt/scope.mts'

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm run wpt-scope:check')
  } else {
    runNode(
      fileURLToPath(new URL('../../check/wpt/scope.mts', import.meta.url)),
      process.argv.slice(2),
    )
  }
}
