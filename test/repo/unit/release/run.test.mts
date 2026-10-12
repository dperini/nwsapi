import { expect, test, vi } from 'vitest'
import type * as Config from '../../../../scripts/repo/release/config.mts'
import type * as Artifact from '../../../../scripts/repo/release/artifact.mts'
import type * as Registry from '../../../../scripts/repo/release/registry.mts'
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
vi.mock('../../../../scripts/repo/release/registry.mts', async original => ({
  ...(await original<typeof Registry>()),
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
  resolveApprovalVersion,
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
  ).toMatchObject({
    command: 'approve',
    stage: STAGE,
    apply: true,
  })
  expect(parseReleaseArgs(['approve'])).toMatchObject({
    command: 'approve',
    apply: false,
  })
  expect(parseReleaseArgs(['approve', VERSION])).toMatchObject({
    command: 'approve',
    version: VERSION,
  })
  expect(
    parseReleaseArgs(['--', 'approve', VERSION, '--stage', STAGE, '--apply']),
  ).toMatchObject({
    command: 'approve',
    apply: true,
  })
  for (const args of [
    ['stage', '--apply'],
    ['prepare', '2.0.0'],
    ['status', VERSION],
    ['unknown'],
    ['status', '--stage', STAGE],
  ]) {
    expect(() => parseReleaseArgs(args)).toThrow()
  }
  expect(() => parseReleaseArgs(['approve', '3.0.0'])).toThrow()
  expect(() =>
    parseReleaseArgs(['approve', VERSION, '--stage', 'bad']),
  ).toThrow()
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await main(['--help'])
  expect(log).toHaveBeenCalledWith(HELP)
  log.mockRestore()
})

test('approval version prefers the active request and validates the manifest fallback', () => {
  expect(resolveApprovalVersion(undefined, VERSION, {})).toBe(VERSION)
  expect(
    resolveApprovalVersion(undefined, null, {
      name: 'nwsapi',
      version: VERSION,
    }),
  ).toBe(VERSION)
  expect(() =>
    resolveApprovalVersion(undefined, null, {
      name: 'nwsapi',
      version: '2.3.0-prerelease',
    }),
  ).toThrow('exact 3.x')
  expect(() =>
    resolveApprovalVersion(undefined, null, {
      name: 'other',
      version: VERSION,
    }),
  ).toThrow('package manifest')
})

test('approval discovers a unique exact stage before dispatch', async () => {
  vi.clearAllMocks()
  vi.stubEnv('CI', '')
  vi.stubEnv('GITHUB_ACTIONS', '')
  calls.read.mockReturnValueOnce(
    JSON.stringify([
      {
        id: STAGE,
        packageName: 'nwsapi',
        version: VERSION,
        tag: 'next',
        status: 'staged',
      },
    ]),
  )
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await main(['approve', VERSION])
  expect(calls.read).toHaveBeenCalledWith(['stage', 'list', 'nwsapi', '--json'])
  expect(calls.approve).toHaveBeenCalledWith(VERSION, STAGE, false)
  expect(JSON.parse(log.mock.calls[0]![0])).toEqual({ approved: true })
  vi.unstubAllEnvs()
})

test('approval rejects CI before stage reads or proof-of-presence', async () => {
  vi.clearAllMocks()
  vi.stubEnv('CI', 'true')
  calls.read.mockReturnValue('[]')
  await expect(main(['approve', VERSION])).rejects.toThrow('maintainer')
  expect(calls.read).not.toHaveBeenCalled()
  expect(calls.approve).not.toHaveBeenCalled()
  vi.unstubAllEnvs()
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
    if (args[0] === 'approve') {
      vi.stubEnv('CI', '')
      vi.stubEnv('GITHUB_ACTIONS', '')
    }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await main([...args])
    expect(calls[call]).toHaveBeenCalledOnce()
    expect(JSON.parse(log.mock.calls[0]![0])).toBeTypeOf('object')
    vi.unstubAllEnvs()
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
