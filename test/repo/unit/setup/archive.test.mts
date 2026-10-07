import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
const command = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync: command }))
import {
  extractArchive,
  matchesArchive,
  treeDigest,
} from '../../../../scripts/repo/setup/archive.mts'

test('file contents cannot impersonate another entry in an installed tree', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-tool-tree-'))
  try {
    const first = path.join(directory, 'a')
    const second = path.join(directory, 'b')
    writeFileSync(first, 'prefix', { mode: 0o600 })
    writeFileSync(second, 'suffix', { mode: 0o600 })
    const expected = treeDigest(directory)
    const mode = lstatSync(second).mode
    writeFileSync(first, `prefixb\0${mode}\0suffix`)
    rmSync(second)
    expect(treeDigest(directory)).not.toBe(expected)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('matching trees include directories and symlink identity', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-archive-match-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const directories = [path.join(root, 'first'), path.join(root, 'second')]
  for (let i = 0, length = directories.length; i < length; i += 1) {
    const directory = directories[i]!
    mkdirSync(path.join(directory, 'nested'), { recursive: true })
    writeFileSync(path.join(directory, 'file'), 'bytes')
    symlinkSync('file', path.join(directory, 'link'))
  }
  expect(matchesArchive(directories[0]!, directories[1]!)).toBe(true)
  expect(matchesArchive(path.join(root, 'missing'), directories[1]!)).toBe(
    false,
  )
  const alias = path.join(root, 'alias')
  symlinkSync(directories[0]!, alias)
  expect(matchesArchive(alias, directories[1]!)).toBe(false)
  writeFileSync(path.join(directories[1]!, 'file'), 'changed')
  expect(matchesArchive(directories[0]!, directories[1]!)).toBe(false)
})
test.each([
  { asset: 'archive.tar.gz', platform: 'darwin', program: 'tar' },
  { asset: 'archive.zip', platform: 'darwin', program: 'unzip' },
  { asset: 'archive.zip', platform: 'win32', program: 'powershell' },
])(
  'extracts $asset on $platform with the expected command',
  ({ asset, platform, program }) => {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: platform })
    command.mockClear()
    try {
      extractArchive(asset, '/fixture')
      expect(command.mock.calls[0]![0]).toBe(program)
    } finally {
      Object.defineProperty(process, 'platform', { value: original })
    }
  },
)
