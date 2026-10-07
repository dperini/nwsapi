import { expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type * as Command from '../../../../scripts/repo/lib/command.mts'
import {
  npmCommand,
  npmRead,
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

test('trusted npm strips only npm overrides and preserves caller directories', t => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-registry-config-'))
  t.onTestFinished(() => rmSync(cwd, { recursive: true, force: true }))
  const run = vi.fn<CommandRunner>((_command, _args, options) => {
    expect(options.env!['npm_config_registry']).toBeUndefined()
    expect(options.env!['OTHER']).toBe('retained')
    return { status: 0, stdout: 'ok', stderr: '' }
  })
  expect(
    npmCommand(['view'], {
      cwd,
      run,
      trusted: true,
      env: { npm_config_registry: 'other', OTHER: 'retained' },
    }),
  ).toBe('ok')
  expect(existsSync(cwd)).toBe(true)
})
test('stage validation accepts alternate ID field and rejects missing details', () => {
  expect(
    parseStage(
      { stageId: STAGE, packageName: 'nwsapi', version: VERSION, tag: 'next' },
      VERSION,
    ).id,
  ).toBe(STAGE)
  expect(() => parseStage(null, VERSION)).toThrow()
  expect(() =>
    parseStage(
      { packageName: 'nwsapi', version: VERSION, tag: 'next' },
      VERSION,
    ),
  ).toThrow()
  expect(() =>
    parseStage(
      { id: STAGE, packageName: 'nwsapi', version: VERSION, tag: 'next' },
      VERSION,
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    ),
  ).toThrow()
  expect(() =>
    uploadStage('candidate.tgz', {
      run: () => ({ status: 0, stdout: '{}', stderr: '' }),
    }),
  ).toThrow()
})
test.each([new Error('denied'), 'non-error'])(
  'read retries only proof-of-presence failures',
  error => {
    expect(() =>
      npmRead(['view'], {
        run: () => {
          throw error
        },
      }),
    ).toThrow()
  },
)
test('default command runner is injectable without launching npm', async () => {
  vi.resetModules()
  const actual = await vi.importActual<typeof Command>(
    '../../../../scripts/repo/lib/command.mts',
  )
  const execute = vi.fn<CommandRunner>(() => ({
    status: 0,
    stdout: 'ok',
    stderr: '',
  }))
  vi.doMock('../../../../scripts/repo/lib/command.mts', () => ({
    ...actual,
    execute,
  }))
  try {
    const module = await import('../../../../scripts/repo/release/registry.mts')
    expect(module.npmCommand(['view'])).toBe('ok')
    expect(execute).toHaveBeenCalledOnce()
  } finally {
    vi.doUnmock('../../../../scripts/repo/lib/command.mts')
  }
})
