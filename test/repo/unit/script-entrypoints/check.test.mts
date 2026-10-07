import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import {
  checkScriptEntrypoints,
  discoverScriptEntrypoints,
  inspectEntrypointSource,
  runnerTargets,
} from '../../../../scripts/repo/script-entrypoints/check.mts'

const directories: string[] = []
afterEach(() => {
  directories.forEach(directory =>
    rmSync(directory, { recursive: true, force: true }),
  )
  directories.length = 0
  vi.doUnmock('../../../../scripts/repo/lib/paths.mts')
  vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
  vi.doUnmock('@ultrathink/acorn.rs.wasm')
  vi.resetModules()
})
function fixture(scripts: Record<string, string> | undefined) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-entrypoint-'))
  directories.push(root)
  mkdirSync(path.join(root, 'scripts/repo/nested'), { recursive: true })
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }))
  return root
}
function source(root: string, file: string, content: string) {
  writeFileSync(path.join(root, 'scripts/repo', file), content)
}
test('AST inspection distinguishes structural help and guarded execution', () => {
  expect(
    inspectEntrypointSource(
      "if(isMainModule(import.meta.url)){args.includes('--help');args['includes']('-h')}",
    ),
  ).toEqual({ guarded: true, help: true })
  expect(
    inspectEntrypointSource(
      "const obj={};obj.other('--help'); args.includes(name); (()=>0)(); obj[()=>0]();",
    ),
  ).toEqual({ guarded: false, help: false })
})
test('shell command tokenization preserves quoting and detects unfinished quotes', () => {
  expect(
    runnerTargets(
      "node 'scripts/repo/run.mts' \"scripts/repo/a.mts\"; echo ignored && node scripts/repo/run.mts 'scripts/repo/b.mts'",
    ),
  ).toEqual(['scripts/repo/a.mts', 'scripts/repo/b.mts'])
  expect(
    runnerTargets('node scripts/repo/run.mts "scripts/repo/a\\\"b.mts"'),
  ).toEqual(['scripts/repo/a"b.mts'])
  expect(() =>
    runnerTargets('node scripts/repo/run.mts "scripts/repo/a\\'),
  ).toThrow()
  expect(runnerTargets('echo ')).toEqual([])
})

test('inspection tolerates missing AST properties and reports non-Error parse failures', async () => {
  vi.doMock('@ultrathink/acorn.rs.wasm', () => ({
    parse: (input: string) => {
      if (input === 'fail') {
        throw 'parse failed'
      }
      return {
        type: 'Program',
        body: [
          null,
          42,
          {
            type: 'CallExpression',
            callee: { type: 'MemberExpression' },
            arguments: [],
          },
        ],
      }
    },
  }))
  vi.resetModules()
  const module =
    await import('../../../../scripts/repo/script-entrypoints/check.mts')
  expect(module.inspectEntrypointSource('fixture')).toEqual({
    guarded: false,
    help: false,
  })
  const root = fixture(undefined)
  source(root, 'bad.mts', 'fail')
  expect(module.discoverScriptEntrypoints(root).errors).toHaveLength(1)
})

test('CLI reports invalid targets and returns a failing status', async () => {
  const root = fixture({
    missing: 'node scripts/repo/run.mts scripts/repo/missing.mts',
  })
  vi.doMock('../../../../scripts/repo/lib/paths.mts', async original => ({
    ...(await original<object>()),
    REPO_ROOT: root,
  }))
  vi.doMock('../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: (url: string) =>
      url.endsWith('/script-entrypoints/check.mts'),
  }))
  const argv = process.argv
  const exitCode = process.exitCode
  process.argv = [argv[0]!, '/script-entrypoints/check.mts']
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.resetModules()
  try {
    await import('../../../../scripts/repo/script-entrypoints/check.mts')
    expect(error).toHaveBeenCalledOnce()
    expect(process.exitCode).toBe(1)
  } finally {
    process.argv = argv
    process.exitCode = exitCode
  }
})
test('package targets and otherwise guarded scripts share a sorted inventory', () => {
  const root = fixture({
    z: 'node scripts/repo/run.mts scripts/repo/a.mts',
    a: 'node scripts/repo/run.mts scripts/repo/a.mts',
  })
  source(root, 'a.mts', 'export const a=1')
  source(
    root,
    'nested/b.mts',
    "if(isMainModule(import.meta.url)){args.includes('-h')}",
  )
  source(root, 'notes.txt', 'not code')
  symlinkSync(
    path.join(root, 'scripts/repo/a.mts'),
    path.join(root, 'scripts/repo/alias.mts'),
  )
  expect(checkScriptEntrypoints(root)).toEqual({
    entrypoints: [
      {
        file: 'scripts/repo/a.mts',
        packageScripts: ['a', 'z'],
        guarded: false,
        help: false,
      },
      {
        file: 'scripts/repo/nested/b.mts',
        packageScripts: [],
        guarded: true,
        help: true,
      },
    ],
    errors: [],
  })
})
test('missing, escaping and invalid modules produce discovery failures', () => {
  const root = fixture({
    missing: 'node scripts/repo/run.mts scripts/repo/missing.mts',
    escape: 'node scripts/repo/run.mts ../outside.mts',
    dependency: 'node scripts/repo/run.mts node_modules/tool.mts',
    other: 'node scripts/repo/run.mts script.js',
  })
  source(root, 'bad.mts', 'const =')
  expect(discoverScriptEntrypoints(root).errors).toHaveLength(3)
  expect(() => checkScriptEntrypoints(root)).toThrow()
  expect(discoverScriptEntrypoints(fixture(undefined))).toEqual({
    entrypoints: [],
    errors: [],
  })
})

test.each([
  { args: ['--help'] },
  { args: ['--json'] },
  { args: [] },
  { args: ['--check'] },
])('CLI accepts options %j', async ({ args }) => {
  const root = fixture({ a: 'node scripts/repo/run.mts scripts/repo/a.mts' })
  source(
    root,
    'a.mts',
    "if(isMainModule(import.meta.url)){args.includes('--help')}",
  )
  vi.doMock('../../../../scripts/repo/lib/paths.mts', async original => ({
    ...(await original<object>()),
    REPO_ROOT: root,
  }))
  vi.doMock('../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: (url: string) =>
      url.endsWith('/script-entrypoints/check.mts'),
  }))
  const argv = process.argv
  process.argv = [argv[0]!, '/script-entrypoints/check.mts', ...args]
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.resetModules()
  try {
    await import('../../../../scripts/repo/script-entrypoints/check.mts')
    expect(log).toHaveBeenCalledOnce()
  } finally {
    process.argv = argv
  }
})
