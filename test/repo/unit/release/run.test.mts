import { expect, test, vi } from 'vitest'
import {
  HELP,
  main,
  parseReleaseArgs,
} from '../../../../scripts/repo/release/run.mts'
import { STAGE, VERSION } from '../../util/release-fixture.mts'

test('release CLI separates plans from explicit writes', async () => {
  expect(parseReleaseArgs(['prepare', VERSION])).toMatchObject({
    command: 'prepare',
    version: VERSION,
    apply: false,
  })
  expect(
    parseReleaseArgs(['approve', VERSION, '--stage', STAGE, '--apply']),
  ).toMatchObject({ command: 'approve', stage: STAGE, apply: true })
  expect(
    parseReleaseArgs(['--', 'approve', VERSION, '--stage', STAGE, '--apply']),
  ).toMatchObject({ command: 'approve', apply: true })
  for (const args of [
    ['approve', VERSION],
    ['stage', '--apply'],
    ['prepare', '2.0.0'],
    ['status', VERSION],
    ['unknown'],
    ['status', '--stage', STAGE],
  ]) {
    expect(() => parseReleaseArgs(args)).toThrow()
  }
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await main(['--help'])
  expect(log).toHaveBeenCalledWith(HELP)
  log.mockRestore()
})
