import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { ensureManagedTools } from './manager.mts'

type Run = (
  command: string,
  args: string[],
) => { status: number | null; signal: NodeJS.Signals | null; error?: Error }

export async function prepareCheckout(
  ensure = ensureManagedTools,
  run: Run = (command, args) =>
    spawnSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit' }),
) {
  try {
    const tools = await ensure()
    const node = path.join(
      tools,
      process.platform === 'win32' ? 'node.exe' : 'node',
    )
    for (const script of [
      'scripts/repo/setup/agents.mts',
      'scripts/repo/video/prepare.mts',
      'scripts/repo/build/run.mts',
    ]) {
      const args = script.endsWith('agents.mts')
        ? [script, '--optional']
        : [script]
      const result = run(node, args)
      if (result.error) {
        throw result.error
      }
      if (result.status !== 0 || result.signal) {
        throw new Error(`Preparation failed while running ${script}.`)
      }
    }
  } catch (error) {
    console.error(
      `Preparation failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    console.error('Retry: node scripts/repo/setup/prepare.mts')
    process.exitCode = 1
  }
}

if (isMainModule(import.meta.url)) {
  await prepareCheckout()
}
