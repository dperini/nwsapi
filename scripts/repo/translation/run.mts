import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'

const project = path.join(REPO_ROOT, '.config/docs-translation')
const task = process.argv[2] ?? 'translate'
const script = path.join(REPO_ROOT, `scripts/repo/translation/${task}.py`)
if (!['setup', 'translate'].includes(task)) {
  throw new Error(`Unknown translation task: ${task}`)
}
execFileSync(
  path.join(REPO_ROOT, '.cache/bin/uv'),
  ['run', '--project', project, '--locked', 'python', script],
  { cwd: REPO_ROOT, stdio: 'inherit' },
)
