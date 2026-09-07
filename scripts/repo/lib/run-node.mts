import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { REPO_ROOT } from './paths.mts'

export function runNode(entry: string, args: string[] = []) {
  execFileSync(process.execPath, [entry, ...args], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  })
}

export function isMainModule(url: string) {
  return process.argv[1] === fileURLToPath(url)
}
