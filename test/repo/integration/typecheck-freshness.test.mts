import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const compiler = path.join(
  path.dirname(require.resolve('typescript/package.json')),
  'bin/tsc',
)

test('type checks reject changed ambient declarations after successful runs', t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-typecheck-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  const { compilerOptions } = JSON.parse(
    readFileSync(
      new URL('../../../.config/tsconfig.check.json', import.meta.url),
      'utf8',
    ),
  )
  const configuration = path.join(directory, 'tsconfig.json')
  writeFileSync(
    configuration,
    JSON.stringify({
      compilerOptions: { ...compilerOptions, types: [] },
      files: ['runtime.d.ts', 'consumer.mts'],
    }),
  )
  const declaration = path.join(directory, 'runtime.d.ts')
  writeFileSync(declaration, 'interface Engine { select(): Element[] }')
  writeFileSync(
    path.join(directory, 'consumer.mts'),
    'declare const engine: Engine; export const nodes: Element[] = engine.select();',
  )
  const check = () =>
    spawnSync(process.execPath, [compiler, '--noEmit', '-p', configuration], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 15_000,
    })
  expect(check().status).toBe(0)
  expect(check().status).toBe(0)
  writeFileSync(
    declaration,
    'interface Engine { select(): Element[] | NodeListOf<Element> }',
  )
  const changed = check()
  expect(changed.error).toBeUndefined()
  expect(changed.status).not.toBe(0)
  expect(changed.stdout).toContain('TS2322')
  expect(check().status).not.toBe(0)
  writeFileSync(declaration, 'interface Engine { select(): Element[] }')
  expect(check().status).toBe(0)
})
