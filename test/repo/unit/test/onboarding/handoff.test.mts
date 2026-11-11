import { expect, test } from 'vitest'
import {
  bootstrapNextCommand,
  MINIMUM_NODE_BOOTSTRAP_COMMAND,
  verifyMinimumNodeBootstrap,
} from '../../../../../scripts/repo/test/onboarding/handoff.mts'
import { DEVELOPER_MENU_COMMAND } from '../../../../../scripts/repo/lib/paths.mts'
import type { CommandRunner } from '../../../../../scripts/repo/test/onboarding/scenario.mts'

test('bootstrap next action uses the pnpm menu command', () => {
  expect(
    bootstrapNextCommand(
      'Core checkout: ready\nNext: ' + DEVELOPER_MENU_COMMAND.join(' ') + '\n',
    ),
  ).toEqual(DEVELOPER_MENU_COMMAND)
})

test('missing or unsupported next actions fail handoff verification', () => {
  for (const output of [
    'Core ready',
    'Next: npm run dev',
    'Next: node other.mts',
  ]) {
    expect(() => bootstrapNextCommand(output)).toThrow('pnpm')
  }
})

test('minimum Node bootstrap uses its explicit command contract and verifies the printed handoff', async () => {
  const phases: string[] = []
  const command: CommandRunner = async (_file, phase, executable, args) => {
    phases.push(phase)
    if (phase === 'minimum Node bootstrap') {
      expect(executable).toBe('/tools/node')
      expect(args).toEqual([...MINIMUM_NODE_BOOTSTRAP_COMMAND])
      return {
        code: 0,
        stdout: `Setup complete.\nNext: ${DEVELOPER_MENU_COMMAND.join(' ')}\n`,
        stderr: '',
      }
    }
    expect(executable).toBe('pnpm')
    expect(args).toEqual(DEVELOPER_MENU_COMMAND.slice(1))
    return { code: 0, stdout: '', stderr: '' }
  }

  await verifyMinimumNodeBootstrap(
    '/tmp/onboarding.log',
    '/tmp/checkout',
    '/tools/node',
    {},
    command,
  )

  expect(phases).toEqual([
    'minimum Node bootstrap',
    'printed bootstrap next command',
  ])
})
