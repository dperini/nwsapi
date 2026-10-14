import { expect, test, vi } from 'vitest'
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
