import { expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  accumulatedCoverage,
  runTypeCoverage,
  writeTypeCoverage,
} from '../../../scripts/repo/lib/type-coverage.mts'

const metric = {
  covered: 2,
  total: 3,
  pct: 66.66,
  files: 1,
  strict: false,
  engine: 'typescript-7-native' as const,
}

test('type identifiers remain separate from execution counts', () => {
  const execution = { lines: { covered: 98, total: 100, pct: 98 } }
  expect(accumulatedCoverage(execution, metric)).toEqual({
    execution,
    types: metric,
  })
  expect(execution.lines.total).toBe(100)
})

test('uses native TS7 and the maintained-source config', () => {
  const measure = vi.fn(() => metric)
  expect(runTypeCoverage('/fixture', measure)).toEqual(metric)
  expect(measure).toHaveBeenCalledWith(
    path.join('/fixture', '.config/tsconfig.check.json'),
  )
  const config = JSON.parse(readFileSync('.config/tsconfig.check.json', 'utf8'))
  expect(config.compilerOptions.allowJs).toBe(false)
  expect(config.include).toContain('../src/**/*.mts')
})

test('propagates compiler failure instead of omitting type coverage', () => {
  expect(() =>
    runTypeCoverage('/fixture', () => {
      throw new Error('Compiler diagnostic')
    }),
  ).toThrow('Compiler diagnostic')
})

test('writes the independently measured type artifact', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-type-coverage-'))
  try {
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
