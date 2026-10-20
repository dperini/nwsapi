import { expect, test, vi } from 'vitest'
import {
  main,
  parseVideoArguments,
  videoPlan,
} from '../../../../scripts/repo/video/run.mts'

test('video controls preserve action arguments and reject conflicting modes', () => {
  expect(parseVideoArguments(['--setup', '--dry-run', '--json'])).toMatchObject(
    {
      args: ['--setup'],
      dryRun: true,
      json: true,
    },
  )
  expect(() => parseVideoArguments(['--describe', '--dry-run'])).toThrow(
    'Choose --describe or --dry-run.',
  )
})

test('video previews include the crate cache and Cargo build targets', () => {
  expect(videoPlan(['--setup'], '/checkout')).toMatchObject({
    type: 'preview',
    command: 'setup/video',
    invocation: {
      command: 'cargo',
      args: expect.arrayContaining(['build', '--locked']),
    },
    targets: [
      '/checkout/.cache/fframes/archives',
      '/checkout/.cache/fframes/target',
    ],
  })
})

test('video setup dry run prints JSON without preparing dependencies', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await main(['--setup', '--dry-run', '--json'])
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    type: 'preview',
    command: 'setup/video',
  })
})
