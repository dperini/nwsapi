import { expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  accumulatedCoverage,
  parseTypeCoverage,
  runTypeCoverage,
  writeTypeCoverage,
} from '../../../scripts/repo/lib/type-coverage.mts'

function output(correctCount: number, totalCount: number) {
  return JSON.stringify({ succeeded: true, correctCount, totalCount })
}

test('type identifiers remain separate from execution counts', () => {
  const types = parseTypeCoverage(output(2, 3))
  const execution = { lines: { covered: 98, total: 100, pct: 98 } }
  expect(accumulatedCoverage(execution, types)).toEqual({
    execution,
    types: { covered: 2, total: 3, pct: 66.66 },
  })
  expect(execution.lines.total).toBe(100)
})

test.each([
  'invalid json',
  JSON.stringify({ succeeded: false, error: 'Compiler API unavailable' }),
  output(0, 0),
  output(-1, 2),
  output(3, 2),
  output(1.5, 2),
  JSON.stringify({ succeeded: true }),
])('rejects incomplete or failed analysis: %s', result => {
  expect(() => parseTypeCoverage(result)).toThrow()
})

test('executes the analyzer with the source-inclusive config', () => {
  const execute = vi.fn(() => ({
    status: 0,
    stdout: output(9, 10),
    stderr: '',
  }))
  expect(runTypeCoverage('/fixture', execute).pct).toBe(90)
  expect(execute).toHaveBeenCalledWith(process.execPath, [
    path.join('/fixture', 'node_modules/type-coverage/bin/type-coverage'),
    '--project',
    path.join('/fixture', '.config/tsconfig.check.json'),
    '--strict',
    '--json-output',
  ])
  const config = JSON.parse(readFileSync('.config/tsconfig.check.json', 'utf8'))
  expect(config.compilerOptions.allowJs).toBe(false)
  expect(config.include).toContain('../src/**/*.mts')
})

test.each([
  { status: 1, stdout: '', stderr: 'Compiler failed' },
  { status: 0, stdout: output(9, 10), stderr: 'Compiler diagnostic' },
  { status: null, stdout: '', stderr: '', error: new Error('Spawn failed') },
])(
  'propagates process diagnostics instead of omitting type coverage',
  failure => {
    expect(() => runTypeCoverage('/fixture', () => failure)).toThrow(
      failure.error?.message ?? failure.stderr,
    )
  },
)

test('writes the independently measured type artifact', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-type-coverage-'))
  try {
    const metric = parseTypeCoverage(output(4, 5))
    writeTypeCoverage(root, metric)
    expect(
      JSON.parse(
        readFileSync(path.join(root, 'coverage/type-coverage.json'), 'utf8'),
      ),
    ).toEqual(metric)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
