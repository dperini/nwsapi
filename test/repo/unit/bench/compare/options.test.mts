import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, vi } from 'vitest'
import {
  metadata,
  options,
  writeReport,
} from '../../../../../scripts/repo/bench/compare/options.mts'

const args = [
  '--baseline',
  path.join(os.tmpdir(), 'before.cjs'),
  '--output',
  path.join(os.tmpdir(), 'report.json'),
]
test('comparison options reject invalid measurement budgets and fixture sizes', () => {
  assert.throws(() => options([]))
  for (const pair of [
    ['--groups', '1'],
    ['--matches', '257'],
    ['--matches', ''],
    ['--rounds', '0'],
    ['--batch', 'Infinity'],
    ['--milliseconds', '-1'],
    ['--mode', 'both'],
    ['--layout', 'unknown'],
    ['--scenario', 'unknown'],
  ]) {
    assert.throws(() => options([...args, ...pair]))
  }
  const result = options([
    ...args,
    '--matches',
    '0,1,16,256',
    '--mode',
    'memory',
  ])
  assert.deepEqual(result.counts, [0, 1, 16, 256])
  assert.equal(result.mode, 'memory')
})

test('comparison metadata fingerprints both measured inputs and persists structured reports', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-compare-meta-'))
  const baseline = path.join(directory, 'baseline.cjs')
  const candidate = path.join(directory, 'candidate.cjs')
  const output = path.join(directory, 'report.json')
  try {
    writeFileSync(baseline, 'before')
    writeFileSync(candidate, 'after')
    const config = options([
      '--baseline',
      baseline,
      '--candidate',
      candidate,
      '--output',
      output,
      '--scenario',
      'has',
      '--layout',
      'nested',
    ])
    const report = metadata(config)
    assert.equal(report.scenario, 'has')
    assert.equal(report.layout, 'nested')
    assert.equal(report.hashes.length, 2)
    assert.notEqual(report.hashes[0], report.hashes[1])
    assert.equal(report.harnessSourceHash.length, 64)
    assert.equal(report.mitataSourceHash.length, 64)
    assert.equal(report.host.platform, process.platform)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    writeReport(output, report)
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), report)
    log.mockRestore()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
