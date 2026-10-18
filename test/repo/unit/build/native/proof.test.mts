import { expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { normalizePath } from '../../../../../scripts/repo/lib/paths.mts'
import type * as ChildProcess from 'node:child_process'
import type * as FileSystem from 'node:fs'

const spies = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  mkdtempSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
  copyFileSync: vi.fn(),
  chmodSync: vi.fn(),
  spawnSync: vi.fn(),
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof FileSystem>()
  return {
    ...actual,
    mkdirSync: spies.mkdirSync,
    mkdtempSync: spies.mkdtempSync,
    writeFileSync: spies.writeFileSync,
    rmSync: spies.rmSync,
    copyFileSync: spies.copyFileSync,
    chmodSync: spies.chmodSync,
  }
})

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof ChildProcess>()
  return { ...actual, spawnSync: spies.spawnSync }
})

vi.mock('../../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => false,
}))

test('importing the proof exposes callable helpers without starting work', async () => {
  const proof =
    await import('../../../../../scripts/repo/build/native/proof.mts')

  expect(proof.runNativeProof).toBeTypeOf('function')
  expect(proof.runTuiProof).toBeTypeOf('function')
  expect(spies.mkdirSync).not.toHaveBeenCalled()
  expect(spies.mkdtempSync).not.toHaveBeenCalled()
  expect(spies.writeFileSync).not.toHaveBeenCalled()
  expect(spies.rmSync).not.toHaveBeenCalled()
  expect(spies.copyFileSync).not.toHaveBeenCalled()
  expect(spies.chmodSync).not.toHaveBeenCalled()
  expect(spies.spawnSync).not.toHaveBeenCalled()
})

test('proof arguments require an explicit local CLI and native template', async () => {
  const { parseNativeProofArguments } =
    await import('../../../../../scripts/repo/build/native/proof.mts')

  expect(() => parseNativeProofArguments([])).toThrow(
    '--abi-executable <path> and --ffi-template <path>',
  )
  expect(() =>
    parseNativeProofArguments([
      '--abi-executable',
      '/local/abi',
      '--ffi-template',
      '/local/ffi-stub.node',
      'unexpected',
    ]),
  ).toThrow('named options only')
  expect(
    parseNativeProofArguments([
      '--abi-executable',
      '/local/abi',
      '--ffi-template',
      '/local/ffi-stub.node',
    ]),
  ).toEqual({
    abiExecutable: '/local/abi',
    ffiTemplate: '/local/ffi-stub.node',
  })
})

test('proof paths preserve the supplied CLI and template without a download step', async () => {
  const { createProofPaths } =
    await import('../../../../../scripts/repo/build/native/proof.mts')
  const root = path.resolve('/checkout')
  const paths = createProofPaths({
    root,
    abiExecutable: 'tools/abi',
    ffiTemplate: 'templates/darwin-arm64/ffi-stub.node',
  })

  expect(
    Object.fromEntries(
      Object.entries(paths).map(([name, value]) => [
        name,
        normalizePath(value),
      ]),
    ),
  ).toEqual({
    root: normalizePath(root),
    cache: normalizePath(path.join(root, '.cache/hybrid')),
    abiExecutable: normalizePath(path.join(root, 'tools/abi')),
    ffiTemplate: normalizePath(
      path.join(root, 'templates/darwin-arm64/ffi-stub.node'),
    ),
    directCarrier: normalizePath(
      path.join(root, '.cache/hybrid/opentui-ffi-carrier.node'),
    ),
  })
})

test('cache poisoning rejects source paths outside the owned temporary directory', async () => {
  const { verifyCarrierCache } =
    await import('../../../../../scripts/repo/build/native/proof.mts')
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'nwsapi-cache-proof-'),
  )
  const ownedDirectory = path.join(temporaryDirectory, 'owned')
  const sourcePath = path.join(temporaryDirectory, 'source.dylib')
  const originalBytes = Buffer.from('source-library')
  await mkdir(ownedDirectory)
  await writeFile(sourcePath, originalBytes)
  try {
    expect(() =>
      verifyCarrierCache(
        { libraryPath: sourcePath, elapsedMs: 1 },
        { libraryPath: sourcePath, elapsedMs: 1 },
        createHash('sha512').update(originalBytes).digest('hex'),
        {
          directCarrier: '/checkout/carrier.node',
          root: '/checkout',
          cache: '/checkout/.cache/hybrid',
          abiExecutable: '/tools/abi',
          ffiTemplate: '/templates/ffi-stub.node',
        },
        ownedDirectory,
        vi.fn(() => ''),
      ),
    ).toThrow('outside the owned temporary directory')
    expect(await readFile(sourcePath)).toEqual(originalBytes)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})

test('cache validation rejects symlinks inside the owned temporary directory', async () => {
  const { validateOwnedCachePath } =
    await import('../../../../../scripts/repo/build/native/proof.mts')
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'nwsapi-cache-proof-'),
  )
  const cacheFile = path.join(temporaryDirectory, 'library.dylib')
  const cacheLink = path.join(temporaryDirectory, 'library-link.dylib')
  await writeFile(cacheFile, 'library')
  await symlink(cacheFile, cacheLink)
  try {
    expect(() => validateOwnedCachePath(cacheLink, temporaryDirectory)).toThrow(
      'cannot contain symlinks',
    )
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
})
