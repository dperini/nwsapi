import { DEVELOPER_MENU_COMMAND } from '../../lib/paths.mts'
import { readJourney } from './readme.mts'
import type { CommandRunner } from './scenario.mts'

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

export async function verifyBootstrapHandoff(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
) {
  const step = (await readJourney(checkout)).find(
    item => item.id === 'bootstrap',
  )
  if (!step || step.command[0] !== 'node') {
    throw new Error('README bootstrap must use the direct Node entry point.')
  }
  const result = await command(
    log,
    'literal README bootstrap journey',
    node,
    step.command.slice(1),
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
