import { isMainModule } from '../lib/run-node.mts'
import { bootstrapNodeIssue } from './node-version.mts'

export function main(
  version = process.versions.node,
  log: (message: string) => void = console.error,
) {
  const issue = bootstrapNodeIssue(version)
  if (issue) {
    log(issue)
    return 1
  }
  return 0
}

if (isMainModule(import.meta.url)) {
  process.exitCode = main()
}
