import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type * as NodeFs from 'node:fs'
import nock from 'nock'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
import {
  releasePin,
  releaseTag,
  updateWpt,
} from '../../../../scripts/repo/wpt/update.mts'
import { updateDependencies } from '../../../../scripts/repo/dependency/update.mts'

const state = vi.hoisted(() => ({
  main: false,
  current: '',
  inventory: '',
  config: '',
  run: vi.fn(),
  write: vi.fn(),
  git: vi.fn(),
}))
vi.mock('node:child_process', () => ({
  execFileSync: (_command: string, args: string[]) => state.git(args),
}))
vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof NodeFs>()
  return {
    ...original,
    readFileSync: (file: NodeFs.PathOrFileDescriptor, options: unknown) => {
      if (String(file).endsWith('/.gitmodules')) {
        return state.config
      }
      if (String(file).endsWith('/test/repo/e2e/upstream/inventory.json')) {
        return JSON.stringify({ revision: state.inventory })
      }
      return original.readFileSync(
        file,
        options as Parameters<typeof original.readFileSync>[1],
      )
    },
    writeFileSync: state.write,
  }
})
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: (url: string) =>
    state.main && url.endsWith('/scripts/repo/wpt/update.mts'),
  runNode: state.run,
}))

const sha = 'a'.repeat(40)
const hash = 'b'.repeat(64)
const config = `# wpt-old sha256:${'c'.repeat(64)}\n[submodule "upstream/wpt"]\n\tref = ${'d'.repeat(40)}\n# no-release-tag: web-platform-tests publishes no release tags\n`

beforeEach(() => {
  vi.clearAllMocks()
  state.main = false
  state.current = sha
  state.inventory = sha
  state.config = config
  state.git.mockImplementation((args: string[]) =>
    args.includes('ls-tree') ? '100644 blob fixture\tfile\n' : state.current,
  )
  vi.stubEnv('GITHUB_TOKEN', '')
  vi.stubEnv('GH_TOKEN', '')
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function github(shaValue = sha) {
  return nock('https://api.github.com')
    .get('/repos/web-platform-tests/wpt/releases/latest')
    .reply(200, { tag_name: 'release/v1', published_at: '2026-10-07' })
    .get('/repos/web-platform-tests/wpt/commits/release%2Fv1')
    .reply(200, { sha: shaValue })
}

test('WPT pins preserve configuration while replacing release provenance', () => {
  const next = releasePin(config, 'merge_pr_62589', sha, hash)
  expect(next).toContain(
    `# merge_pr_62589 sha256:${hash}\n[submodule "upstream/wpt"]`,
  )
  expect(next).toContain(`ref = ${'d'.repeat(40)}`)
  expect(next).not.toContain('no-release-tag')
  expect(() => releasePin('', 'release', sha, hash)).toThrow('integrity header')
  expect(() => releasePin(config, 'release', 'master', hash)).toThrow(
    'Invalid WPT commit',
  )
  expect(() => releasePin(config, 'release', sha, 'unknown')).toThrow(
    'Invalid WPT commit',
  )
})

test('WPT release selection rejects preview releases and malformed tags', () => {
  expect(releaseTag({ tag_name: 'merge_pr_62589' })).toBe('merge_pr_62589')
  for (const release of [
    {},
    { tag_name: 'release', draft: true },
    { tag_name: 'release', prerelease: true },
    { tag_name: 'release\n[submodule "other"]' },
  ]) {
    expect(() => releaseTag(release)).toThrow('published, non-prerelease tag')
  }
})

test('dependency updates refresh WPT before install hooks and keep previews read-only', () => {
  const calls: string[] = []
  const run = () => {
    calls.push('registry')
  }
  const install = () => {
    calls.push('install')
  }
  const wpt = (preview: boolean) => {
    calls.push(preview ? 'wpt-check' : 'wpt-write')
  }
  updateDependencies(true, run, install, () => {}, wpt)
  expect(calls).toEqual(['registry', 'wpt-check'])
  calls.length = 0
  updateDependencies(false, run, install, () => {}, wpt)
  expect(calls).toEqual(['registry', 'wpt-write', 'install'])
  calls.length = 0
  expect(() =>
    updateDependencies(
      false,
      run,
      install,
      () => {},
      () => {
        throw new Error('release unavailable')
      },
    ),
  ).toThrow('release unavailable')
  expect(calls).toEqual(['registry'])
})

test('preview resolves the published tag but does not modify the checkout', async () => {
  const requests = github()
  await updateWpt(true)
  expect(requests.isDone()).toBe(true)
  expect(state.run).not.toHaveBeenCalled()
  expect(state.write).not.toHaveBeenCalled()
})

test('the current pin verifies fixtures and refreshes audits without fetching a different commit', async () => {
  const requests = github()
  await updateWpt()
  expect(requests.isDone()).toBe(true)
  expect(state.git).toHaveBeenCalledTimes(1)
  expect(state.run.mock.calls.map(call => call[1])).toEqual([
    ['clone', 'upstream/wpt'],
    ['verify', 'upstream/wpt'],
    ['--write'],
    [],
  ])
})

test('a changed release records its measured tree digest and regenerates stale inventory', async () => {
  state.current = 'd'.repeat(40)
  state.inventory = state.current
  const requests = github()
  await updateWpt(false)
  expect(requests.isDone()).toBe(true)
  expect(state.git.mock.calls.map(call => call[0])).toEqual([
    [
      'config',
      '--file',
      `${REPO_ROOT}/.gitmodules`,
      '--get',
      'submodule.upstream/wpt.ref',
    ],
    [
      '-C',
      'upstream/wpt',
      'fetch',
      '--depth=1',
      '--filter=blob:none',
      'origin',
      sha,
    ],
    ['-C', 'upstream/wpt', '-c', 'core.quotePath=false', 'ls-tree', '-r', sha],
    [
      'config',
      '--file',
      `${REPO_ROOT}/.gitmodules`,
      'submodule.upstream/wpt.ref',
      sha,
    ],
  ])
  expect(state.write).toHaveBeenCalledOnce()
  expect(state.run.mock.calls.map(call => call[1])).toEqual([
    ['clone', 'upstream/wpt'],
    ['verify', 'upstream/wpt'],
    ['clone', 'upstream/wpt'],
    ['verify', 'upstream/wpt'],
    ['--fetch', '--write'],
    ['--write'],
    [],
  ])
})

test('authenticated release lookup uses either supported environment token', async () => {
  const variables = ['GITHUB_TOKEN', 'GH_TOKEN']
  for (let i = 0, length = variables.length; i < length; i += 1) {
    vi.stubEnv('GITHUB_TOKEN', '')
    vi.stubEnv('GH_TOKEN', '')
    vi.stubEnv(variables[i]!, 'fixture-token')
    const requests = github().matchHeader(
      'authorization',
      'Bearer fixture-token',
    )
    await updateWpt(true)
    expect(requests.isDone()).toBe(true)
  }
})

test('failed HTTP responses and malformed commit resolutions cannot write a pin', async () => {
  const request = nock('https://api.github.com')
    .get('/repos/web-platform-tests/wpt/releases/latest')
    .reply(503)
  await expect(updateWpt()).rejects.toBeInstanceOf(Error)
  expect(request.isDone()).toBe(true)
  const requests = github('not-a-sha')
  await expect(updateWpt()).rejects.toBeInstanceOf(Error)
  expect(requests.isDone()).toBe(true)
  expect(state.write).not.toHaveBeenCalled()
})

test('the WPT update entrypoint accepts preview mode and rejects unrelated options', async () => {
  state.main = true
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        return property === 'argv'
          ? ['node', 'update.mts', '--check']
          : Reflect.get(target, property)
      },
    }),
  )
  vi.resetModules()
  const requests = github()
  await import('../../../../scripts/repo/wpt/update.mts')
  expect(requests.isDone()).toBe(true)
  expect(state.run).not.toHaveBeenCalled()
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        return property === 'argv'
          ? ['node', 'update.mts', '--invalid']
          : Reflect.get(target, property)
      },
    }),
  )
  vi.resetModules()
  await expect(
    import('../../../../scripts/repo/wpt/update.mts'),
  ).rejects.toBeInstanceOf(Error)
})
