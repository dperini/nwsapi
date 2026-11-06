import { execFileSync } from 'node:child_process'
import { parseCliArgs as parseArgs } from '../lib/cli/arguments.mts'
import path from 'node:path'
import { isMainModule } from '../lib/run-node.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { setupTak } from '../setup/tak.mts'

type TakAction = 'run' | 'record' | 'push' | 'history'

export function parseTakAction(args: string[]): TakAction {
  const { positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
  })
  const action = positionals[0] ?? 'run'
  if (
    positionals.length > 1 ||
    !['run', 'record', 'push', 'history'].includes(action)
  ) {
    throw new Error('Usage: pnpm run bench:tak [run|record|push|history]')
  }
  return action as TakAction
}

export async function main(args = process.argv.slice(2)) {
  const action = parseTakAction(args[0] === '--' ? args.slice(1) : args)
  await setupTak()
  if (action === 'run' || action === 'record') {
    execFileSync('pnpm', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    })
  }
  const argumentsByAction: Record<TakAction, string[]> = {
    run: ['run', '--bench', 'node_selectors'],
    record: ['run', '--bench', 'node_selectors', '--record'],
    push: ['push'],
    history: ['log', '--bench', 'node_selectors', '-n', '20'],
  }
  execFileSync(
    path.join(REPO_ROOT, '.cache/bin/tak'),
    argumentsByAction[action],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    },
  )
}

if (isMainModule(import.meta.url)) {
  await main()
}
