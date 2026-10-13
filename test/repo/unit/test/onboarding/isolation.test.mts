import { expect, test } from 'vitest'
import path from 'node:path'
import { normalizePath } from '../../../../../scripts/repo/lib/paths.mts'
import {
  isolatedEnvironment,
  makeSandbox,
  sha256,
} from '../../../../../scripts/repo/test/onboarding/isolation.mts'
import { hashes } from '../../../../../scripts/repo/test/onboarding/environment.mts'
import {
  assertHarnessResult,
  assertTaskDiscovery,
  parseHarnessJson,
} from '../../../../../scripts/repo/test/onboarding/protocol.mts'
import { parseJourney } from '../../../../../scripts/repo/test/onboarding/readme.mts'

test('onboarding environment keeps scoped paths and explicit proxy or CA settings', () => {
  const env = isolatedEnvironment('/tmp/isolated', '/entry:/manager', {
    PATH: '/host',
    NODE_OPTIONS: '--require=host-hook',
    NODE_PATH: '/host/modules',
    npm_config_registry: 'https://private.invalid',
    pnpm_config_store_dir: '/host/store',
    HTTPS_PROXY: 'http://proxy.invalid',
    NODE_EXTRA_CA_CERTS: '/ca.pem',
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    ComSpec: 'C:\\Windows\\System32\\cmd.exe',
    GITHUB_TOKEN: 'secret',
  })
  expect(env['PATH']).toBe('/entry:/manager')
  expect(normalizePath(env['HOME']!)).toBe('/tmp/isolated/home')
  expect(normalizePath(env['npm_config_cache']!)).toBe(
    '/tmp/isolated/npm-cache',
  )
  expect(normalizePath(env['pnpm_config_store_dir']!)).toBe(
    '/tmp/isolated/pnpm-store',
  )
  expect(normalizePath(env['TMPDIR']!)).toBe('/tmp/isolated/tmp')
  expect(normalizePath(env['TEMP']!)).toBe('/tmp/isolated/tmp')
  expect(normalizePath(env['APPDATA']!)).toBe('/tmp/isolated/appdata/roaming')
  expect(env['NODE_OPTIONS']).toBeUndefined()
  expect(env['NODE_PATH']).toBeUndefined()
  expect(env['npm_config_registry']).toBeUndefined()
  expect(env['GITHUB_TOKEN']).toBeUndefined()
  expect(env['HTTPS_PROXY']).toBe('http://proxy.invalid')
  expect(env['NODE_EXTRA_CA_CERTS']).toBe('/ca.pem')
  expect(env['PATHEXT']).toBe('.COM;.EXE;.BAT;.CMD')
  expect(env['ComSpec']).toBe('C:\\Windows\\System32\\cmd.exe')
})

test('README parser returns executable shell words from scoped commands', () => {
  // These markers are the runner's local contract for executable onboarding commands.
  const parsed = parseJourney(
    '<!-- onboarding:bootstrap:start -->\n```sh\nnode scripts/repo/setup/bootstrap.mts\n```\n<!-- onboarding:bootstrap:end -->',
  )
  expect(parsed).toEqual([
    { id: 'bootstrap', command: ['node', 'scripts/repo/setup/bootstrap.mts'] },
  ])
})

test('README parser rejects missing or repeated executable markers', () => {
  expect(() => parseJourney('# no executable steps')).toThrow(
    /no marked onboarding commands/,
  )
  const repeated =
    '<!-- onboarding:bootstrap:start -->\n```sh\nnode x\n```\n<!-- onboarding:bootstrap:end -->\n<!-- onboarding:bootstrap:start -->\n```sh\nnode y\n```\n<!-- onboarding:bootstrap:end -->'
  expect(() => parseJourney(repeated)).toThrow(/IDs must be unique/)
})

test('harness JSON parsing requires one object and validates discovery shape', () => {
  const value = parseHarnessJson(
    '{"schemaVersion":1,"type":"tasks","tasks":[{"id":"setup"},{"id":"guide"},{"id":"review"},{"id":"ci:local"},{"id":"setup:check"}]}',
  )
  expect(() => assertTaskDiscovery(value)).not.toThrow()
  expect(() => parseHarnessJson('{"status":"completed"}\nextra')).toThrow()
  expect(() =>
    assertTaskDiscovery({ schemaVersion: 1, type: 'result', tasks: [] }),
  ).toThrow()
})

test('harness results tie task status to the exact envelope and exit status', () => {
  const success = {
    schemaVersion: 1,
    type: 'result',
    task: 'setup:check',
    status: 'completed',
    exitCode: 0,
  }
  expect(() =>
    assertHarnessResult(success, 'completed', 0, 'setup:check'),
  ).not.toThrow()
  expect(() =>
    assertHarnessResult(success, 'failed', 0, 'setup:check'),
  ).toThrow()
  expect(() =>
    assertHarnessResult(success, 'completed', 1, 'setup:check'),
  ).toThrow()
  expect(() =>
    assertHarnessResult(
      { status: 'completed', exitCode: 0 },
      'completed',
      0,
      'setup:check',
    ),
  ).toThrow()
})

test('sha256 fingerprints sentinel bytes', () => {
  expect(sha256('sentinel')).toBe(
    '2b7847b7b705781d7cf21a05e9c1bb37cbf078aea103bc3edcc6aca52ab65453',
  )
})

test('sandbox protects common shell profile and manager configuration files', async () => {
  const sandbox = await makeSandbox()
  try {
    const sentinels = await hashes(path.join(sandbox.directory, 'home'), [
      '.npmrc',
      '.pnpmrc',
      '.gitconfig',
      '.zshrc',
      '.bashrc',
      '.profile',
      '.bash_profile',
      '.zprofile',
    ])
    expect(Object.values(sentinels).every(value => value !== null)).toBe(true)
  } finally {
    await sandbox.cleanup()
  }
})
