import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import nock from 'nock'
import { afterEach, expect, test, vi } from 'vitest'
import type { ToolPlan } from '../../../../scripts/repo/external-tools.mts'

const directories: string[] = []
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
      return {
        ...actual,
        lstatSync: (file: string) => {
          const stat = actual.lstatSync(file)
          return invalid === 'directory' && file.endsWith('/sfw')
            ? { isFile: () => false }
            : stat
        },
        realpathSync: (file: string) =>
          invalid === 'escape' && file.endsWith('/sfw')
            ? '/outside/executable'
            : actual.realpathSync(file),
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
