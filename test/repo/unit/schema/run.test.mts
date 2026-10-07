import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { parse } from 'acorn'
import path from 'node:path'
import { afterAll, expect, test, vi } from 'vitest'
import {
  compileValidator,
  COMPILER_OPTIONS,
  formatGenerated,
  generateSchemas,
  main,
  schemaArtifacts,
  SCHEMAS,
} from '../../../../scripts/repo/schema/run.mts'
import type * as RepoPaths from '../../../../scripts/repo/lib/paths.mts'
import type * as NodeRunner from '../../../../scripts/repo/lib/run-node.mts'

const state = vi.hoisted(() => ({
  root: '/tmp/nwsapi-schema-test-' + process.pid,
  main: '',
  output: 'export default value => typeof value === "object"',
  warnings: [] as string[],
}))
const compiler = vi.hoisted(() =>
  vi.fn(
    (_schema: object, options: { onWarning: (warning: string) => void }) => {
      state.warnings.forEach(warning => options.onWarning(warning))
      return state.output
    },
  ),
)
vi.mock('node:module', () => ({
  createRequire: () => () => ({ toStandaloneModule: compiler }),
}))
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(
    (_command: string, _args: string[], options: { input: string }) =>
      options.input,
  ),
}))
vi.mock('../../../../scripts/repo/lib/paths.mts', async importOriginal => ({
  ...(await importOriginal<typeof RepoPaths>()),
  REPO_ROOT: state.root,
}))
vi.mock('../../../../scripts/repo/lib/run-node.mts', async importOriginal => ({
  ...(await importOriginal<typeof NodeRunner>()),
  isMainModule: (url: string) =>
    Boolean(state.main) && url.endsWith('/schema/' + state.main),
}))
mkdirSync(state.root, { recursive: true })
afterAll(() => rmSync(state.root, { recursive: true, force: true }))

test('validator compilation uses strict compiler options and rejects warning-bearing or empty output', () => {
  const source = compileValidator({ type: 'object' })
  expect(
    parse(source, { ecmaVersion: 'latest', sourceType: 'module' }).body[0]
      ?.type,
  ).toBe('ExportDefaultDeclaration')
  expect(compiler.mock.lastCall?.[1]).toMatchObject(COMPILER_OPTIONS)
  expect(formatGenerated('{}', 'schema.json')).toBe('{}')
  state.warnings = ['Unsupported schema keyword']
  expect(() => compileValidator({})).toThrow()
  state.warnings = []
  state.output = ''
  expect(() => compileValidator({})).toThrow()
  state.output = 'export default value => typeof value === "object"'
})

test('schema generation produces paired JSON schemas and executable validators and detects drift', async () => {
  const artifacts = schemaArtifacts()
  expect(artifacts).toHaveLength(Object.keys(SCHEMAS).length * 2)
  const schemas = artifacts.filter(artifact => artifact.file.endsWith('.json'))
  expect(
    schemas.every(
      artifact =>
        JSON.parse(artifact.source).$schema ===
        'https://json-schema.org/draft/2020-12/schema',
    ),
  ).toBe(true)
  const validator = artifacts.find(artifact => artifact.file.endsWith('.mts'))!
  const module = await import(
    'data:text/javascript;base64,' +
      Buffer.from(validator.source).toString('base64')
  )
  expect(module.default({})).toBe(true)
  expect(module.default('invalid')).toBe(false)
  generateSchemas()
  expect(() => generateSchemas(true)).not.toThrow()
  const first = artifacts[0]!
  expect(
    JSON.parse(readFileSync(path.join(state.root, first.file), 'utf8')),
  ).toHaveProperty('type')
  writeFileSync(path.join(state.root, first.file), '{}')
  expect(() => generateSchemas(true)).toThrow()
  generateSchemas(false)
})

test('schema commands provide help, reject unknown flags and invoke generate or check lanes', async () => {
  await import('../../../../scripts/repo/schema/check.mts')
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  main(['--help'])
  main(['-h'])
  expect(log).toHaveBeenCalledTimes(2)
  expect(() => main(['--unknown'])).toThrow()
  main([])
  main(['--check'])
  const argv = process.argv
  try {
    state.main = 'run.mts'
    process.argv = ['node', 'run.mts', '--check']
    vi.resetModules()
    await import('../../../../scripts/repo/schema/run.mts')
    state.main = 'check.mts'
    process.argv = ['node', 'check.mts', '--help']
    vi.resetModules()
    await import('../../../../scripts/repo/schema/check.mts')
    process.argv = ['node', 'check.mts']
    vi.resetModules()
    await import('../../../../scripts/repo/schema/check.mts')
  } finally {
    process.argv = argv
    state.main = ''
  }
})
