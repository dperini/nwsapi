import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import nock from 'nock'
import { afterEach, expect, test, vi } from 'vitest'
import type { ToolPlan } from '../../../../scripts/repo/external-tools.mts'

const directories: string[] = []
function mockPnpmDownload(bytes: Buffer) {
  nock('https://github.com')
    .get('/example/pnpm/releases/download/v1.0.0/pnpm-test')
    .reply(200, bytes)
}

afterEach(() => {
  directories.forEach(directory =>
    fs.rmSync(directory, { recursive: true, force: true }),
  )
  directories.length = 0
  vi.doUnmock('node:fs')
  vi.doUnmock('../../../../scripts/repo/external-tools.mts')
  vi.resetModules()
})

test('an identical verified installation reuses its executable', async () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'nwsapi-install-reuse-'))
  directories.push(cache)
  const bytes = Buffer.from('executable')
  const plan: ToolPlan = {
    name: 'sfw',
    version: '1.0.0',
    asset: 'sfw-test',
    binary: 'sfw',
    format: 'binary',
    integrity: 'sha256-' + createHash('sha256').update(bytes).digest('base64'),
    url: 'https://github.com/example/sfw/releases/download/v1.0.0/sfw-test',
  }
  nock('https://github.com')
    .get('/example/sfw/releases/download/v1.0.0/sfw-test')
    .reply(200, bytes)
  vi.doMock('../../../../scripts/repo/external-tools.mts', async original => ({
    ...(await original<object>()),
    TOOL_CACHE: cache,
  }))
  vi.resetModules()
  const { installTool } =
    await import('../../../../scripts/repo/setup/install.mts')
  const executable = await installTool(plan)
  const inode = fs.statSync(executable).ino
  expect(await installTool(plan)).toBe(executable)
  expect(fs.statSync(executable).ino).toBe(inode)
})

test.each(['directory', 'escape'])(
  'rejects an executable with invalid %s identity before installation',
  async invalid => {
    const cache = fs.mkdtempSync(
      path.join(os.tmpdir(), 'nwsapi-install-guard-'),
    )
    directories.push(cache)
    const bytes = Buffer.from('executable')
    const plan: ToolPlan = {
      name: 'sfw',
      version: '1.0.0',
      asset: 'sfw-test',
      binary: 'sfw',
      format: 'binary',
      integrity:
        'sha256-' + createHash('sha256').update(bytes).digest('base64'),
      url: 'https://github.com/example/sfw/releases/download/v1.0.0/sfw-test',
    }
    nock('https://github.com')
      .get('/example/sfw/releases/download/v1.0.0/sfw-test')
      .reply(200, bytes)
    vi.doMock('node:fs', async original => {
      const actual = await original<typeof fs>()
      const realpathSync = Object.assign(
        (file: string) =>
          invalid === 'escape' && path.basename(file) === 'sfw'
            ? '/outside/executable'
            : actual.realpathSync(file),
        {
          native: (file: string) =>
            invalid === 'escape' && path.basename(file) === 'sfw'
              ? '/outside/executable'
              : actual.realpathSync.native(file),
        },
      )
      return {
        ...actual,
        lstatSync: (file: string) => {
          const stat = actual.lstatSync(file)
          return invalid === 'directory' && path.basename(file) === 'sfw'
            ? { isFile: () => false }
            : stat
        },
        realpathSync,
      }
    })
    vi.resetModules()
    const { installTool } =
      await import('../../../../scripts/repo/setup/install.mts')
    await expect(installTool(plan, cache)).rejects.toThrow()
    const parent = path.join(cache, 'sfw', '1.0.0')
    if (fs.existsSync(parent)) {
      expect(
        fs.readdirSync(parent).some(name => name.startsWith('.install-')),
      ).toBe(false)
    }
  },
)

test('Windows repair removes extras while preserving an active identical executable', async () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'nwsapi-install-active-'))
  directories.push(cache)
  const bytes = Buffer.from('active executable')
  const plan: ToolPlan = {
    name: 'pnpm',
    version: '1.0.0',
    asset: 'pnpm-test',
    binary: 'pnpm.exe',
    format: 'binary',
    integrity: 'sha256-' + createHash('sha256').update(bytes).digest('base64'),
    url: 'https://github.com/example/pnpm/releases/download/v1.0.0/pnpm-test',
  }
  const { toolDirectory } =
    await import('../../../../scripts/repo/external-tools.mts')
  const target = toolDirectory(plan, cache)
  const { installTool } =
    await import('../../../../scripts/repo/setup/install.mts')
  mockPnpmDownload(bytes)
  await installTool(plan, cache, undefined, 'win32', {})
  const executable = path.join(target, plan.binary)
  const inode = fs.statSync(executable).ino
  fs.writeFileSync(path.join(target, 'unexpected'), 'remove me')
  await installTool(plan, cache, undefined, 'win32', {
    npm_execpath: executable,
  })
  expect(fs.statSync(executable).ino).toBe(inode)
  expect(fs.existsSync(path.join(target, 'unexpected'))).toBe(false)
})

test('active Windows executable mismatch fails before changing the cache', async () => {
  const cache = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-install-active-mismatch-'),
  )
  directories.push(cache)
  const bytes = Buffer.from('verified executable')
  const plan: ToolPlan = {
    name: 'pnpm',
    version: '1.0.0',
    asset: 'pnpm-test',
    binary: 'pnpm.exe',
    format: 'binary',
    integrity: 'sha256-' + createHash('sha256').update(bytes).digest('base64'),
    url: 'https://github.com/example/pnpm/releases/download/v1.0.0/pnpm-test',
  }
  const { toolDirectory } =
    await import('../../../../scripts/repo/external-tools.mts')
  const target = toolDirectory(plan, cache)
  const { installTool } =
    await import('../../../../scripts/repo/setup/install.mts')
  mockPnpmDownload(bytes)
  await installTool(plan, cache, undefined, 'win32', {})
  const executable = path.join(target, plan.binary)
  fs.writeFileSync(executable, 'damaged executable')
  fs.writeFileSync(path.join(target, 'other.txt'), 'leave untouched')
  const before = fs.readdirSync(target).toSorted()
  await expect(
    installTool(plan, cache, undefined, 'win32', { npm_execpath: executable }),
  ).rejects.toThrow('Close this package-manager process')
  expect(fs.readFileSync(executable, 'utf8')).toBe('damaged executable')
  expect(fs.readFileSync(path.join(target, 'other.txt'), 'utf8')).toBe(
    'leave untouched',
  )
  expect(fs.readdirSync(target).toSorted()).toEqual(before)
  expect(
    fs
      .readdirSync(path.dirname(target))
      .some(name => name.startsWith('.install-')),
  ).toBe(false)
})

test('a direct Node bootstrap repairs an inactive Windows executable', async () => {
  const cache = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-install-inactive-'),
  )
  directories.push(cache)
  const bytes = Buffer.from('verified executable')
  const plan: ToolPlan = {
    name: 'pnpm',
    version: '1.0.0',
    asset: 'pnpm-test',
    binary: 'pnpm.exe',
    format: 'binary',
    integrity: 'sha256-' + createHash('sha256').update(bytes).digest('base64'),
    url: 'https://github.com/example/pnpm/releases/download/v1.0.0/pnpm-test',
  }
  const { toolDirectory } =
    await import('../../../../scripts/repo/external-tools.mts')
  const target = toolDirectory(plan, cache)
  const { installTool } =
    await import('../../../../scripts/repo/setup/install.mts')
  mockPnpmDownload(bytes)
  await installTool(plan, cache, undefined, 'win32', {})
  fs.writeFileSync(path.join(target, plan.binary), 'damaged executable')
  await installTool(plan, cache, undefined, 'win32', {})
  expect(fs.readFileSync(path.join(target, plan.binary))).toEqual(bytes)
})
