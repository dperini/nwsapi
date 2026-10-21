import { REPO_ROOT } from '../lib/external-tools.mjs'
import path from 'node:path'

console.log(
  `Contributor guide: ${path.relative(REPO_ROOT, path.join(REPO_ROOT, 'docs/repo/development/first-change.md'))}`,
)
