import type { CommandRunner } from '../scenario.mts'
import {
  assertHarnessResult,
  assertTaskDiscovery,
  parseHarnessJson,
} from '../protocol.mts'
import { readJourney } from '../readme.mts'
import { resolveReadmeHarnessCommand } from './commands.mts'

export async function runReadmeHarnessSteps(
  log: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
) {
  for (const step of await readJourney(checkout)) {
    if (step.id !== 'task-discovery' && step.id !== 'readiness') {
      continue
    }
    const resolved = resolveReadmeHarnessCommand(step, checkout, env)
    const result = await command(
      log,
      `literal README ${step.id}`,
      resolved.executable,
      resolved.args,
      checkout,
      resolved.env,
      undefined,
      step.id === 'readiness' ? null : 0,
    )
    if (step.id === 'readiness' && result.code !== 0) {
      await captureReadinessDetails(log, checkout, node, env, command)
    }
    const value = parseHarnessJson(result.stdout)
    if (step.id === 'task-discovery') {
      assertTaskDiscovery(value)
    } else {
      assertHarnessResult(value, 'completed', result.code, 'setup:check')
    }
  }
}

async function captureReadinessDetails(
  file: string,
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  command: CommandRunner,
) {
  await command(
    file,
    'setup diagnostics detail after readiness failure',
    node,
    ['scripts/repo/setup/doctor.mts', '--details'],
    checkout,
    env,
    undefined,
    null,
  )
}
