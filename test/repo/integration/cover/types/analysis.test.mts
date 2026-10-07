import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { measureNativeTypeCoverage } from '../../../../../scripts/repo/cover/types/analysis.mts'
import type { UntypedIdentifier } from '../../../../../scripts/repo/cover/types/analysis.mts'

function fixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-type-coverage-'))
  const config = path.join(directory, 'tsconfig.json')
  const source = path.join(directory, 'consumer.mts')
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: 'ES2024',
        module: 'NodeNext',
        types: [],
      },
      files: ['consumer.mts'],
    }),
  )
  return { directory, config, source }
}

test('the saved compiler API distinguishes typed identifiers from any', t => {
  const { directory, config, source } = fixture()
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  writeFileSync(source, 'export const identity = (value: string) => value')
  const typed = measureNativeTypeCoverage(config)
  expect(typed.engine).toBe('tsrs')
  expect(typed.files).toBe(1)
  expect(typed.total).toBeGreaterThan(0)
  expect(typed.pct).toBe(100)

  writeFileSync(source, 'export const identity = (value: any) => value')
  const untyped: UntypedIdentifier[] = []
  const partial = measureNativeTypeCoverage(config, (_, identifiers) => {
    untyped.push(...identifiers)
  })
  expect(partial.total).toBe(typed.total)
  expect(partial.covered).toBeLessThan(typed.covered)
  expect(partial.pct).toBeLessThan(100)
  expect(untyped.length).toBeGreaterThan(0)
  expect(untyped.every(identifier => identifier.name === 'value')).toBe(true)
})

test('type coverage rejects a project with compiler diagnostics', t => {
  const { directory, config, source } = fixture()
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  writeFileSync(source, 'export const value: string = 42')
  expect(() => measureNativeTypeCoverage(config)).toThrow()
})
