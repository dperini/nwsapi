import { expect, test, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  npmCommand,
  parseStage,
  publishedVersion,
  uploadStage,
} from '../../../../scripts/repo/release/registry.mts'
import type { CommandRunner } from '../../../../scripts/repo/lib/command.mts'
import {
  STAGE,
  VERSION,
  registryResponse,
} from '../../util/release-fixture.mts'

test('registry absence is distinct from a failed authenticated or network read', async () => {
  expect(await publishedVersion(VERSION, registryResponse())).toBeUndefined()
  await expect(
    publishedVersion(VERSION, registryResponse(503)),
  ).rejects.toThrow('503')
  expect(
    await publishedVersion(
      VERSION,
      registryResponse(200, { version: VERSION }),
    ),
  ).toEqual({ version: VERSION })
})

test('stages bind package, UUID, version and dist-tag before promotion', () => {
  const stage = {
    id: STAGE,
    packageName: 'nwsapi',
    version: VERSION,
    tag: 'next',
  }
  expect(parseStage(stage, VERSION, STAGE).id).toBe(STAGE)
  for (const replacement of [
    { id: 'bad' },
    { packageName: 'elsewhere' },
    { version: '3.0.0' },
    { tag: 'latest' },
  ]) {
    expect(() =>
      parseStage({ ...stage, ...replacement }, VERSION, STAGE),
    ).toThrow()
  }
})

test('trusted npm runs isolate config and stage without approval or lifecycle scripts', () => {
  let temporary = ''
  const run = vi.fn<CommandRunner>((_command, args, options) => {
    temporary = options.cwd
    expect(readFileSync(options.env!['NPM_CONFIG_USERCONFIG']!, 'utf8')).toBe(
      '',
    )
    expect(args).toContain('--ignore-scripts')
    expect(args).toContain('--provenance')
    expect(args.slice(1, 3)).toEqual(['stage', 'publish'])
    expect(args).not.toContain('approve')
    return {
      status: 0,
      stdout: JSON.stringify({ nwsapi: { stageId: STAGE } }),
      stderr: '',
    }
  })
  expect(uploadStage('/tmp/candidate.tgz', { run, env: {} })).toBe(STAGE)
  expect(existsSync(temporary)).toBe(false)
  expect(() =>
    npmCommand(['stage', 'list'], {
      run: () => ({ status: 1, stdout: '', stderr: 'denied' }),
    }),
  ).toThrow('denied')
})

test('proof of presence for a read retries through an interactive terminal without mutating registry state', async () => {
  const { npmRead } =
    await import('../../../../scripts/repo/release/registry.mts')
  let authenticated = false
  const run = vi.fn<CommandRunner>((_command, args, options) => {
    expect(args.slice(1, 3)).toEqual(['trust', 'list'])
    if (options.interactive) {
      authenticated = true
    }
    return authenticated
      ? { status: 0, stdout: '[]', stderr: '' }
      : { status: 1, stdout: '', stderr: 'EOTP proof of presence required' }
  })
  expect(npmRead(['trust', 'list', 'nwsapi', '--json'], { run })).toBe('[]')
  expect(run.mock.calls.map(([, , options]) => options.interactive)).toEqual([
    false,
    true,
    false,
  ])
})
