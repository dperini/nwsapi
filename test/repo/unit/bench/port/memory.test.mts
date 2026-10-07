import { invoke, state } from './fixture.mts'
import { expect, test, vi } from 'vitest'
test('memory parent rotates isolated workers and records source fingerprints', async () => {
  await invoke('memory', ['/baseline', '/candidate', '/out'])
  expect(state.exec).toHaveBeenCalledTimes(6)
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(
    report.samples.map((sample: { index: number }) => sample.index),
  ).toEqual([0, 1, 1, 0, 0, 1])
  expect(
    report.files.every((file: { sha256: string }) => file.sha256.length === 64),
  ).toBe(true)
  expect(state.exec.mock.calls[0]![1]).toContain('--expose-gc')
})
test.each([true, false])(
  'worker measures bounded compiler caches bytes=%s',
  async bytes => {
    state.bytes = bytes
    const gc = vi.fn()
    vi.stubGlobal('gc', gc)
    vi.spyOn(WeakRef.prototype, 'deref').mockReturnValue(undefined)
    const log = vi.spyOn(console, 'log')
    await invoke('memory', ['--worker', '/engine'])
    const report = JSON.parse(log.mock.calls[0]![0] as string)
    expect(report.entries).toBe(1800)
    expect(report.estimatedBytes).toBe(bytes ? 300 : null)
    expect(report.detachedCollected).toBe(true)
    expect(state.compile).toHaveBeenCalledTimes(1800)
    expect(state.configure).toHaveBeenCalledTimes(2)
    expect(gc).toHaveBeenCalledTimes(16)
    expect(state.domClose).toHaveBeenCalledOnce()
  },
)
test('worker rejects detached contexts that remain reachable', async () => {
  vi.stubGlobal('gc', () => {})
  vi.spyOn(WeakRef.prototype, 'deref').mockReturnValue({})
  await expect(invoke('memory', ['--worker', '/engine'])).rejects.toThrow()
  expect(state.write).not.toHaveBeenCalled()
})
test('worker requires explicit garbage collection', async () => {
  vi.stubGlobal('gc', undefined)
  await expect(invoke('memory', ['--worker', '/engine'])).rejects.toThrow()
  expect(state.compile).not.toHaveBeenCalled()
})
test('memory parent requires all input paths', async () => {
  await expect(invoke('memory', [])).rejects.toThrow()
})
