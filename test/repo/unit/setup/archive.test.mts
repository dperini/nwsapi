import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
const command = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync: command }))
import {
  compareTrees,
  extractArchive,
  formatTreeMismatches,
  matchesArchive,
  treeDigest,
  reconcileTree,
} from '../../../../scripts/repo/setup/archive.mts'
import { resolvePowerShell } from '../../../../scripts/repo/setup/prerequisites.mts'

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

test('Windows cache identity ignores permission bits and still checks contents', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-archive-windows-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const cached = path.join(root, 'cached')
  const extracted = path.join(root, 'extracted')
  for (const directory of [cached, extracted]) {
    mkdirSync(path.join(directory, 'nested'), { recursive: true, mode: 0o700 })
    writeFileSync(path.join(directory, 'nested', 'tool.exe'), 'verified', {
      mode: 0o600,
    })
  }
  chmodSync(path.join(cached, 'nested', 'tool.exe'), 0o755)
  expect(matchesArchive(cached, extracted, 'win32')).toBe(true)
  expect(matchesArchive(cached, extracted, 'linux')).toBe(false)
  writeFileSync(path.join(extracted, 'nested', 'tool.exe'), 'changed')
  expect(matchesArchive(cached, extracted, 'win32')).toBe(false)
})

test('reconciliation preserves matching entries and repairs files and extras', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-archive-repair-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const cached = path.join(root, 'cached')
  const extracted = path.join(root, 'extracted')
  for (const directory of [cached, extracted]) {
    mkdirSync(path.join(directory, 'nested'), { recursive: true })
    writeFileSync(path.join(directory, 'nested', 'tool.exe'), 'same')
    writeFileSync(path.join(directory, 'repair.txt'), 'verified')
  }
  const active = path.join(cached, 'nested', 'tool.exe')
  const inode = lstatSync(active).ino
  writeFileSync(path.join(cached, 'repair.txt'), 'corrupt')
  writeFileSync(path.join(cached, 'unexpected'), 'extra')
  const mismatches = compareTrees(cached, extracted, 'win32')
  expect(mismatches.map(item => [item.path, item.kind])).toEqual([
    ['repair.txt', 'content'],
    ['unexpected', 'extra'],
  ])
  expect(formatTreeMismatches(mismatches)).toContain('sha256:')
  reconcileTree(cached, extracted, 'win32')
  expect(readFileSync(active, 'utf8')).toBe('same')
  expect(lstatSync(active).ino).toBe(inode)
  expect(readFileSync(path.join(cached, 'repair.txt'), 'utf8')).toBe('verified')
  expect(existsSync(path.join(cached, 'unexpected'))).toBe(false)
  expect(compareTrees(cached, extracted, 'win32')).toEqual([])
})

test('reconciliation replaces a symlink parent without following its target', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-archive-link-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const cached = path.join(root, 'cached')
  const extracted = path.join(root, 'extracted')
  const outside = path.join(root, 'outside')
  mkdirSync(cached)
  mkdirSync(extracted)
  mkdirSync(outside)
  writeFileSync(path.join(outside, 'sentinel'), 'keep')
  mkdirSync(path.join(extracted, 'nested'))
  writeFileSync(path.join(extracted, 'nested', 'file'), 'verified')
  symlinkSync(
    outside,
    path.join(cached, 'nested'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  reconcileTree(cached, extracted, 'win32')
  expect(readFileSync(path.join(cached, 'nested', 'file'), 'utf8')).toBe(
    'verified',
  )
  expect(readFileSync(path.join(outside, 'sentinel'), 'utf8')).toBe('keep')
})

test('directory and mode mismatches respect the Windows mode policy', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-archive-mode-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const cached = path.join(root, 'cached')
  const extracted = path.join(root, 'extracted')
  mkdirSync(cached, { mode: 0o700 })
  mkdirSync(extracted, { mode: 0o700 })
  mkdirSync(path.join(cached, 'nested'), { mode: 0o700 })
  mkdirSync(path.join(extracted, 'nested'), { mode: 0o700 })
  writeFileSync(path.join(cached, 'nested', 'file'), 'same', { mode: 0o600 })
  writeFileSync(path.join(extracted, 'nested', 'file'), 'same', { mode: 0o600 })
  chmodSync(path.join(cached, 'nested', 'file'), 0o400)
  expect(compareTrees(cached, extracted, 'win32')).toEqual([])
  expect(compareTrees(cached, extracted, 'linux')).toContainEqual(
    expect.objectContaining({ path: 'nested/file', kind: 'mode' }),
  )
  rmSync(path.join(cached, 'nested'), { recursive: true })
  writeFileSync(path.join(cached, 'nested'), 'wrong type')
  expect(compareTrees(cached, extracted, 'win32')).toContainEqual(
    expect.objectContaining({ path: 'nested', kind: 'type' }),
  )
  reconcileTree(cached, extracted, 'win32')
  expect(compareTrees(cached, extracted, 'win32')).toEqual([])
  writeFileSync(path.join(cached, 'nested', 'file'), 'damaged')
  chmodSync(path.join(cached, 'nested'), 0o500)
  reconcileTree(cached, extracted, 'linux')
  expect(readFileSync(path.join(cached, 'nested', 'file'), 'utf8')).toBe('same')
  expect(lstatSync(path.join(cached, 'nested')).mode & 0o777).toBe(0o700)
})

test.each([
  { asset: 'archive.tar.gz', platform: 'darwin', program: 'tar' },
  { asset: 'archive.zip', platform: 'darwin', program: 'unzip' },
  {
    asset: 'archive.zip',
    platform: 'win32',
    program: resolvePowerShell(),
  },
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
