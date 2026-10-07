import { expect, test, vi } from 'vitest'
import type * as Config from '../../../../scripts/repo/release/config.mts'
import type * as Artifact from '../../../../scripts/repo/release/artifact.mts'
const calls = vi.hoisted(() => ({
  prepare: vi.fn(async () => ({ prepared: true })),
  verify: vi.fn(async () => ({ verified: true })),
  approve: vi.fn(async () => ({ approved: true })),
  burn: vi.fn(async () => ({ burned: true })),
  stage: vi.fn(async () => ({ staged: true })),
  trust: vi.fn(() => ({ trusted: true })),
  login: vi.fn(() => ({ loggedIn: true })),
  read: vi.fn(() => '[]'),
}))
vi.mock('../../../../scripts/repo/release/git.mts', () => ({
  prepareRelease: calls.prepare,
}))
vi.mock('../../../../scripts/repo/release/artifact.mts', async original => ({
  ...(await original<typeof Artifact>()),
  verifyStage: calls.verify,
}))
vi.mock('../../../../scripts/repo/release/pipeline.mts', () => ({
  approveRelease: calls.approve,
  burnRelease: calls.burn,
  stageRelease: calls.stage,
}))
vi.mock('../../../../scripts/repo/release/trust.mts', () => ({
  configureTrust: calls.trust,
}))
vi.mock('../../../../scripts/repo/release/registry.mts', () => ({
  npmCommand: calls.login,
  npmRead: calls.read,
}))
vi.mock('../../../../scripts/repo/release/config.mts', async original => ({
  ...(await original<typeof Config>()),
  readRequest: () => ({ version: null, distTag: 'next' }),
}))
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

test.each([
  { args: ['prepare', VERSION, '--apply'], call: 'prepare' },
  { args: ['stage'], call: 'stage' },
  { args: ['verify', VERSION, '--stage', STAGE], call: 'verify' },
  { args: ['approve', VERSION, '--stage', STAGE, '--apply'], call: 'approve' },
  { args: ['burn', VERSION], call: 'burn' },
  { args: ['trust', '--apply'], call: 'trust' },
  { args: ['login'], call: 'login' },
  { args: [], call: 'read' },
] as const)(
  'dispatches $call without performing external operations',
  async ({ args, call }) => {
    vi.clearAllMocks()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await main([...args])
    expect(calls[call]).toHaveBeenCalledOnce()
    expect(JSON.parse(log.mock.calls[0]![0])).toBeTypeOf('object')
  },
)

test('argument validation supports help and rejects missing or extra version operands', () => {
  expect(parseReleaseArgs(['--help']).help).toBe(true)
  expect(() => parseReleaseArgs(['prepare'])).toThrow()
  expect(() => parseReleaseArgs(['prepare', VERSION, 'extra'])).toThrow()
})

test('CLI entry point defaults to read-only status', async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.doMock('../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: () => true,
  }))
  const argv = process.argv
  process.argv = ['node', 'run.mts']
  vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await import('../../../../scripts/repo/release/run.mts')
    expect(calls.read).toHaveBeenCalledOnce()
  } finally {
    process.argv = argv
    vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
  }
})
