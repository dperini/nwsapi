import { expect, test } from 'vitest'
import { bootstrapNextCommand } from '../../../../../scripts/repo/test/onboarding/handoff.mts'
import { DEVELOPER_MENU_COMMAND } from '../../../../../scripts/repo/lib/paths.mts'

test('bootstrap next action uses the literal direct Node menu command', () => {
  expect(
    bootstrapNextCommand(
      'Core checkout: ready\nNext: ' + DEVELOPER_MENU_COMMAND.join(' ') + '\n',
    ),
  ).toEqual(DEVELOPER_MENU_COMMAND)
})

test('missing or manager-dependent next actions fail handoff verification', () => {
  for (const output of [
    'Core ready',
    'Next: pnpm run dev',
    'Next: node other.mts',
  ]) {
    expect(() => bootstrapNextCommand(output)).toThrow('direct Node')
  }
})
