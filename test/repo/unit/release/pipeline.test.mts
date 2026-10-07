import { afterEach, expect, test, vi } from 'vitest'
import { statSync } from 'node:fs'
import path from 'node:path'
import {
  approveRelease,
  burnRelease,
  stageRelease,
  reserveBurn,
  STAGE_OPERATIONS,
} from '../../../../scripts/repo/release/pipeline.mts'
import type { CommandRunner } from '../../../../scripts/repo/lib/command.mts'
import {
  COMMIT,
  RECEIPT,
  STAGE,
  TRUSTED_ENV,
  VERSION,
  gitRunner,
  registryResponse,
  releaseFixture,
} from '../../util/release-fixture.mts'

const cleanups: Array<() => void> = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
})

test('CI reserves artifacts before staging and never approves them', async () => {
  const fixture = releaseFixture()
  cleanups.push(fixture.cleanup)
  const order: string[] = []
  const operations: typeof STAGE_OPERATIONS = {
    ...STAGE_OPERATIONS,
    setupEnvironment: () => ({
      create: false,
      addBranch: false,
      branch: 'prerelease/3.0.0',
    }),
    publishedVersion: async () => undefined,
    packRelease: async () => ({
      directory: fixture.root,
      tarball: 'candidate.tgz',
      receipt: RECEIPT,
    }),
    reserveGithubRelease: () => {
      order.push('reserve')
    },
    uploadStage: () => {
      order.push('stage')
      return STAGE
    },
  }
  expect(
    await stageRelease(fixture.root, gitRunner, TRUSTED_ENV, operations),
  ).toMatchObject({ stageId: STAGE })
  expect(order).toEqual(['reserve', 'stage'])
  await expect(
    stageRelease(fixture.root, gitRunner, {}, operations),
  ).rejects.toThrow('OIDC')
  await expect(
    stageRelease(fixture.root, gitRunner, TRUSTED_ENV, {
      ...operations,
      uploadStage: () => {
        throw new Error('network')
      },
    }),
  ).rejects.toThrow('consumed')
  await expect(
    stageRelease(fixture.root, gitRunner, TRUSTED_ENV, {
      ...operations,
      setupEnvironment: () => ({
        create: true,
        addBranch: true,
        branch: 'prerelease/3.0.0',
      }),
    }),
  ).rejects.toThrow('restricted')
})

test('approval is explicit and checks public registry bytes after proof of presence', async () => {
  vi.stubEnv('CI', '')
  vi.stubEnv('GITHUB_ACTIONS', '')
  const run = vi.fn<CommandRunner>(() => ({
    status: 0,
    stdout: '',
    stderr: '',
  }))
  const verify = vi.fn(async () => RECEIPT)
  expect(
    await approveRelease(VERSION, STAGE, false, '/tmp', run, verify),
  ).toMatchObject({ approvalRequired: true })
  expect(run).not.toHaveBeenCalled()
  expect(
    await approveRelease(
      VERSION,
      STAGE,
      true,
      '/tmp',
      run,
      verify,
      registryResponse(200, {
        name: 'nwsapi',
        version: VERSION,
        dist: { integrity: RECEIPT.integrity },
      }),
    ),
  ).toMatchObject({ published: true })
  expect(run.mock.calls[0]?.[1]).toContain('approve')
  await expect(
    approveRelease(
      VERSION,
      STAGE,
      true,
      '/tmp',
      run,
      verify,
      registryResponse(),
    ),
  ).rejects.toThrow('not verified')
  vi.stubEnv('CI', 'true')
  await expect(
    approveRelease(VERSION, STAGE, true, '/tmp', run, verify),
  ).rejects.toThrow('maintainer')
})

test('burn preserves the original release tag and consumes the version before rejection', async () => {
  const fixture = releaseFixture()
  cleanups.push(fixture.cleanup)
  const run = vi.fn<CommandRunner>((command, args, options) =>
    args.includes('view')
      ? {
          status: 0,
          stdout: JSON.stringify({
            id: STAGE,
            packageName: 'nwsapi',
            version: VERSION,
            tag: 'next',
          }),
          stderr: '',
        }
      : gitRunner(command, args, options),
  )
  expect(
    await burnRelease(
      VERSION,
      STAGE,
      false,
      fixture.root,
      run,
      registryResponse(),
    ),
  ).toMatchObject({ burned: false })
  expect(run.mock.calls.some(([, args]) => args[0] === 'push')).toBe(false)
  await burnRelease(VERSION, STAGE, true, fixture.root, run, registryResponse())
  const calls = run.mock.calls.map(([, args]) => args)
  expect(calls).toContainEqual([
    'tag',
    '-s',
    `burned/v${VERSION}`,
    COMMIT,
    '-m',
    `Burn nwsapi ${VERSION}. Never reuse this version.`,
  ])
  expect(calls.findIndex(args => args[0] === 'push')).toBeLessThan(
    calls.findIndex(args => args.includes('reject')),
  )
  expect(calls.flat()).not.toContain('--delete')
  await expect(
    burnRelease(
      VERSION,
      undefined,
      true,
      fixture.root,
      run,
      registryResponse(200, { version: VERSION }),
    ),
  ).rejects.toThrow('Public releases')
})

test('a recorded burn can retry npm rejection without creating or replacing tags', async () => {
  const fixture = releaseFixture()
  cleanups.push(fixture.cleanup)
  const run = vi.fn<CommandRunner>((command, args, options) => {
    if (args[0] === 'ls-remote' && args[2]?.includes('burned/')) {
      return { status: 0, stdout: `${COMMIT}\t${args[2]}`, stderr: '' }
    }
    if (args.includes('view')) {
      return {
        status: 0,
        stdout: JSON.stringify({
          id: STAGE,
          packageName: 'nwsapi',
          version: VERSION,
          tag: 'next',
        }),
        stderr: '',
      }
    }
    return gitRunner(command, args, options)
  })
  await burnRelease(VERSION, STAGE, true, fixture.root, run, registryResponse())
  expect(run.mock.calls.some(([, args]) => args.includes('reject'))).toBe(true)
  expect(
    run.mock.calls.some(([, args]) => ['tag', 'push'].includes(args[0]!)),
  ).toBe(false)
})

test.each(['none', 'published', 'summary'])(
  'staging enforces request and reports $mode',
  async mode => {
    const fixture = releaseFixture(mode === 'none' ? null : VERSION)
    cleanups.push(fixture.cleanup)
    const operations: typeof STAGE_OPERATIONS = {
      ...STAGE_OPERATIONS,
      setupEnvironment: () => ({
        create: false,
        addBranch: false,
        branch: 'prerelease/3.0.0',
      }),
      publishedVersion: async () =>
        mode === 'published' ? { version: VERSION } : undefined,
      packRelease: async () => ({
        directory: fixture.root,
        tarball: 'candidate.tgz',
        receipt: RECEIPT,
      }),
      reserveGithubRelease: () => {},
      uploadStage: () => STAGE,
    }
    const summary = path.join(fixture.root, 'summary.md')
    if (mode === 'summary') {
      expect(
        await stageRelease(
          fixture.root,
          gitRunner,
          { ...TRUSTED_ENV, GITHUB_STEP_SUMMARY: summary },
          operations,
        ),
      ).toMatchObject({ stageId: STAGE })
      expect(statSync(summary).size).toBeGreaterThan(0)
    } else {
      await expect(
        stageRelease(fixture.root, gitRunner, TRUSTED_ENV, operations),
      ).rejects.toThrow()
    }
  },
)
test('a burn without stage consumes the version without npm rejection', async () => {
  const fixture = releaseFixture()
  cleanups.push(fixture.cleanup)
  const run = vi.fn<CommandRunner>(gitRunner)
  expect(
    await burnRelease(
      VERSION,
      undefined,
      true,
      fixture.root,
      run,
      registryResponse(),
    ),
  ).toMatchObject({ burned: true })
  expect(run.mock.calls.some(([, args]) => args.includes('reject'))).toBe(false)
})
test.each(['remote-conflict', 'local-conflict', 'local-valid'])(
  'existing burn identity $mode',
  mode => {
    const fixture = releaseFixture()
    cleanups.push(fixture.cleanup)
    const tag = `burned/v${VERSION}`
    const run = vi.fn<CommandRunner>((command, args, options) => {
      if (args[0] === 'ls-remote' && args[2]?.includes('burned')) {
        return {
          status: 0,
          stdout: mode === 'remote-conflict' ? 'b'.repeat(40) : '',
          stderr: '',
        }
      }
      if (args[0] === 'tag' && args[1] === '--list') {
        return { status: 0, stdout: tag, stderr: '' }
      }
      if (args[0] === 'rev-parse' && args[1] === `${tag}^{commit}`) {
        return {
          status: 0,
          stdout: mode === 'local-conflict' ? 'b'.repeat(40) : COMMIT,
          stderr: '',
        }
      }
      return gitRunner(command, args, options)
    })
    if (mode === 'local-valid') {
      reserveBurn(tag, COMMIT, VERSION, fixture.root, run)
      expect(run.mock.calls.some(([, args]) => args[0] === 'verify-tag')).toBe(
        true,
      )
    } else {
      expect(() =>
        reserveBurn(tag, COMMIT, VERSION, fixture.root, run),
      ).toThrow()
    }
  },
)
