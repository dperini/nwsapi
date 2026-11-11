import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule, runNode } from '../lib/run-node.mts'
import { formatCommandHelp } from './help.mts'

export function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(formatCommandHelp('guide'))
    return
  }
  runNode(path.join(REPO_ROOT, 'node_modules/vite/bin/vite.js'), [
    '--config',
    '.config/model-guide.mts',
    ...args,
  ])
}

if (isMainModule(import.meta.url)) {
  main()
}
