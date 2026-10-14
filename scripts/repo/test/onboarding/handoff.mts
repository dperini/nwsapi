import { DEVELOPER_MENU_COMMAND } from '../../lib/paths.mts'
import type { CommandRunner } from './scenario.mts'

export const MINIMUM_NODE_BOOTSTRAP_COMMAND = [
  'scripts/repo/setup/bootstrap.mts',
] as const

export function bootstrapNextCommand(output: string) {
  const lines = [...output.matchAll(/^Next: (.+)$/gm)]
  const next = lines.at(-1)?.[1]
  if (next !== DEVELOPER_MENU_COMMAND.join(' ')) {
    throw new Error(
      'Bootstrap must print the direct Node menu command as its next action.',
    )
  }
  return [...DEVELOPER_MENU_COMMAND]
}

export async function verifyMinimumNodeBootstrap(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
) {
  const result = await command(
    log,
    'minimum Node bootstrap',
    node,
    [...MINIMUM_NODE_BOOTSTRAP_COMMAND],
    checkout,
    env,
  )
  const next = bootstrapNextCommand(result.stdout)
  await command(
    log,
    'printed bootstrap next command',
    next[0]!,
    next.slice(1),
    checkout,
    env,
  )
}
