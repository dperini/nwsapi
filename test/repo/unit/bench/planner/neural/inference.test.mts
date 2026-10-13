import type * as NodeFs from 'node:fs'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  read: vi.fn(() => Buffer.from('model')),
  write: vi.fn(),
  mkdir: vi.fn(),
  clock: 0,
}))
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  writeFileSync: state.write,
  mkdirSync: state.mkdir,
}))
vi.mock('node:perf_hooks', () => ({
  performance: {
    now: () => {
      state.clock += 1
      return state.clock
    },
  },
}))
afterEach(() => vi.clearAllMocks())

test('standalone inference runner records route-only overhead for domain and fallback cases', async () => {
  const actualFs = await vi.importActual<typeof NodeFs>('node:fs')
  const originalArgs = process.argv
  const originalDirectory = process.cwd()
  const workingDirectory = vi.spyOn(process, 'cwd')
  const fixtureRoot = actualFs.mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-inference-model-'),
  )
  const defaultDirectory = path.join(
    fixtureRoot,
    'assets/repo/bench/planner-neural-2026-10-04',
  )
  const fixtureDirectory = path.join(fixtureRoot, 'fixture/inference')
  const modelSource =
    'export function chooseInverse(features) { return features[0] >= 32 }\n'
  actualFs.mkdirSync(defaultDirectory, { recursive: true })
  actualFs.mkdirSync(fixtureDirectory, { recursive: true })
  actualFs.writeFileSync(path.join(defaultDirectory, 'model.mjs'), modelSource)
  actualFs.writeFileSync(path.join(fixtureDirectory, 'model.mjs'), modelSource)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const paths = [fixtureDirectory, path.resolve(defaultDirectory)]
  try {
    for (let index = 0, length = paths.length; index < length; index += 1) {
      const directory = paths[index]!
      workingDirectory.mockReturnValue(index ? fixtureRoot : originalDirectory)
      vi.resetModules()
      process.argv = index
        ? [originalArgs[0]!, 'inference.mts']
        : [originalArgs[0]!, 'inference.mts', directory]
      const { production } =
        await import('../../../../../../scripts/repo/bench/planner/neural/inference.mts')
      assert.equal(production([32, 768, 3, 4]), true)
      assert.equal(production([32, 768, 2, 4]), false)
      assert.equal(production([193, 768, 0, 4]), false)
      assert.equal(production([32, -1, 0, 4]), true)
      assert.equal(production([32, 769, 0, 4]), false)
      assert.equal(production([32, 768, 0, -1]), false)
      assert.equal(production([32, 768, 0, 5]), false)
      const report = JSON.parse(state.write.mock.calls.at(-1)![1])
      assert.equal(report.rounds, 9)
      assert.equal(report.callsPerRound, 100_000)
      assert.equal(report.modelBytes, 5)
      assert.equal(report.results['in-domain'].model.checksum, 910_000)
      assert.equal(report.results['fallback-small'].model.checksum, 0)
      assert.ok(report.results['in-domain'].model.medianNsPerCall > 0)
      assert.equal(report.results['fallback-small'].rule.checksum, 0)
    }
  } finally {
    process.argv = originalArgs
    workingDirectory.mockRestore()
    vi.resetModules()
    actualFs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
