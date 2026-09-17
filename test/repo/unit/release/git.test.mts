import { afterEach, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  assertClean,
  assertReserved,
  git,
  prepareRelease,
  remoteRef,
} from '../../../../scripts/repo/release/git.mts'
import type { CommandRunner } from '../../../../scripts/repo/lib/command.mts'
import {
  COMMIT,
  VERSION,
  gitRunner,
  registryResponse,
  releaseFixture,
} from '../../util/release-fixture.mts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
})

test('reserved releases require a clean signed source and matching remote tag', () => {
  const fixture = releaseFixture()
  cleanups.push(fixture.cleanup)
  expect(git(['rev-parse', 'HEAD'], fixture.root, gitRunner)).toBe(COMMIT)
  expect(remoteRef('refs/heads/main', fixture.root, gitRunner)).toBe(COMMIT)
  expect(assertReserved(VERSION, fixture.root, gitRunner)).toBe(COMMIT)
  expect(() =>
    assertClean(fixture.root, () => ({
      status: 0,
      stdout: ' M package.json',
      stderr: '',
    })),
  ).toThrow('clean')
  const unsigned: CommandRunner = (command, args, options) =>
    args[0] === 'verify-tag'
      ? { status: 1, stdout: '', stderr: 'unknown key' }
      : command === 'gh'
        ? {
            status: 0,
            stdout: JSON.stringify({ verification: { verified: false } }),
            stderr: '',
          }
        : gitRunner(command, args, options)
  expect(() => assertReserved(VERSION, fixture.root, unsigned)).toThrow(
    'signature',
  )
})

test('prepare defaults to a plan and refuses previously consumed versions', async () => {
  const fixture = releaseFixture(null)
  cleanups.push(fixture.cleanup)
  const run = vi.fn<CommandRunner>((command, args, options) =>
    args[0] === 'ls-remote' && args[2]?.startsWith('refs/tags/')
      ? { status: 0, stdout: '', stderr: '' }
      : gitRunner(command, args, options),
  )
  await prepareRelease(VERSION, false, fixture.root, run, registryResponse())
  expect(
    JSON.parse(readFileSync(path.join(fixture.root, 'package.json'), 'utf8'))
      .version,
  ).toBe('2.3.0-prerelease')
  expect(run.mock.calls.some(([, args]) => args[0] === 'push')).toBe(false)
  await expect(
    prepareRelease(VERSION, false, fixture.root, gitRunner, registryResponse()),
  ).rejects.toThrow('consumed')
  await expect(
    prepareRelease(
      VERSION,
      false,
      fixture.root,
      run,
      registryResponse(200, { version: VERSION }),
    ),
  ).rejects.toThrow('consumed')
  await prepareRelease(VERSION, true, fixture.root, run, registryResponse())
  expect(
    JSON.parse(readFileSync(path.join(fixture.root, 'package.json'), 'utf8'))
      .version,
  ).toBe(VERSION)
  expect(
    run.mock.calls.some(([, args]) => args[0] === 'tag' && args[1] === '-s'),
  ).toBe(true)
  expect(run.mock.calls.at(-1)?.[1]).toEqual([
    'push',
    '--atomic',
    'origin',
    'HEAD:refs/heads/prerelease/3.0.0',
    `refs/tags/v${VERSION}`,
  ])
})

test('preparation refuses unqualified source and local-only version reservations', async () => {
  const fixture = releaseFixture(null)
  cleanups.push(fixture.cleanup)
  const run: CommandRunner = (command, args, options) => {
    if (args[0] === 'ls-remote' && args[2]?.startsWith('refs/tags/')) {
      return { status: 0, stdout: '', stderr: '' }
    }
    if (command === 'gh') {
      return {
        status: 0,
        stdout: JSON.stringify({ workflow_runs: [] }),
        stderr: '',
      }
    }
    return gitRunner(command, args, options)
  }
  await expect(
    prepareRelease(VERSION, true, fixture.root, run, registryResponse()),
  ).rejects.toThrow('successful')
  const reserved: CommandRunner = (command, args, options) =>
    args[0] === 'tag' && args[1] === '--list'
      ? { status: 0, stdout: `v${VERSION}`, stderr: '' }
      : run(command, args, options)
  await expect(
    prepareRelease(VERSION, true, fixture.root, reserved, registryResponse()),
  ).rejects.toThrow('consumed')
  expect(
    JSON.parse(readFileSync(path.join(fixture.root, 'package.json'), 'utf8'))
      .version,
  ).toBe('2.3.0-prerelease')
})
