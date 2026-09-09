import type * as CompileModule from '../../../scripts/repo/compile.mts'
import type * as CliModule from '../../../scripts/repo/cli.mts'
import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { convert } from 'ast-v8-to-istanbul'
import { parse } from 'acorn'
import libCoverage from 'istanbul-lib-coverage'

// Load these as Node does in the executable; avoid transforming jsdom's
// dependency graph through the test runner merely to inspect generated text.
const require = createRequire(import.meta.url)
const { inspectSelector } =
  require('../../../scripts/repo/compile.mts') as typeof CompileModule
const { runCli } = require('../../../scripts/repo/cli.mts') as typeof CliModule

test('compiler inspection reports source, modes, helper bindings and identity selection', async () => {
  const inspect = async (selector: string, options = {}) =>
    JSON.parse(await inspectSelector(selector, { ...options, json: true }))
  const selection = await inspect('div:nth-child(2n)')
  expect(selection.source).toContain('function Resolver(')
  expect(selection.helpers).toContain('s.nthElement')
  expect(selection.sourceBytes).toBe(Buffer.byteLength(selection.source))
  expect((await inspect('.card', { mode: 'match' })).mode).toBe('match')
  expect((await inspect('.card', { mode: 'item' })).source).toContain('c.item(')
  expect((await inspect('.card', { legacy: true })).legacy).toBe(true)
  const identity = await inspect('*')
  expect(identity.source).toBeNull()
  expect(identity.sourceBytes).toBe(0)
  expect(identity.helpers).toEqual([])
  expect(await inspectSelector('*')).toContain('Identity selection')
  expect(await inspectSelector('p')).toContain('function Resolver(')
})

test('CLI dispatches commands and parses flags and literal selectors', async () => {
  expect(await runCli([])).toContain('Usage: nwsapi <command>')
  expect(await runCli(['-h'])).toContain('Usage: nwsapi <command>')
  expect(await runCli(['--help'])).toContain('Usage: nwsapi <command>')
  expect(await runCli(['compile', '-h'])).toContain('--mode')
  await expect(runCli(['unknown'])).rejects.toThrow('Unknown command "unknown"')
  for (const args of [
    [],
    ['--mode'],
    ['--unknown', 'div'],
    ['div', 'span'],
    ['--mode', 'invalid', 'div'],
    [':unknown-pseudo'],
  ] as const) {
    await expect(runCli(['compile', ...args])).rejects.toThrow()
  }
  const compiled = await runCli([
    'compile',
    '-j',
    '--legacy',
    '--mode=match',
    '--',
    '.card',
  ])
  expect(JSON.parse(compiled)).toMatchObject({
    selector: '.card',
    mode: 'match',
    legacy: true,
  })
})

test('the executable runs from another directory and covers every entry-point branch', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-cli-test-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  const bin = fileURLToPath(
    new URL('../../../dist/bin/nwsapi.js', import.meta.url),
  )
  // Real process boundaries remain covered; mode/parser permutations run above.
  const run = (...args: string[]) =>
    spawnSync(bin, args, {
      encoding: 'utf8',
      cwd: directory,
      env: {
        ...process.env,
        NODE_V8_COVERAGE: directory,
        NODE_DISABLE_COMPILE_CACHE: '1',
      },
    })
  const help = run('--help')
  expect(help.status, help.stderr).toBe(0)
  expect(help.stdout).toContain('Usage: nwsapi <command>')
  const compiled = run(
    'compile',
    '-j',
    '--legacy',
    '--mode=match',
    '--',
    '.card',
  )
  expect(compiled.status, compiled.stderr).toBe(0)
  expect(JSON.parse(compiled.stdout)).toMatchObject({
    selector: '.card',
    mode: 'match',
    legacy: true,
  })
  const invalid = run('compile', ':unknown-pseudo')
  expect(invalid.status).toBe(1)
  expect(invalid.stderr).toContain('nwsapi:')
  expect(invalid.stdout).toBe('')
  // A dependency can reject with a plain value instead of an Error instance.
  const preload = path.join(directory, 'reject-value.cjs')
  const cli = fileURLToPath(new URL('../../../dist/cli.js', import.meta.url))
  writeFileSync(
    preload,
    `require(${JSON.stringify(cli)});\n` +
      `require.cache[require.resolve(${JSON.stringify(cli)})].exports = {\n` +
      `  runCli: () => Promise.reject('dependency rejected')\n};\n`,
  )
  const rejected = spawnSync(process.execPath, ['--require', preload, bin], {
    encoding: 'utf8',
    cwd: directory,
    env: {
      ...process.env,
      NODE_V8_COVERAGE: directory,
      NODE_DISABLE_COMPILE_CACHE: '1',
    },
  })
  expect(rejected.status).toBe(1)
  expect(rejected.stdout).toBe('')
  expect(rejected.stderr).toBe('nwsapi: dependency rejected\n')
  const coverage = libCoverage.createCoverageMap({})
  const code = readFileSync(bin, 'utf8')
  for (const file of readdirSync(directory).filter(name =>
    name.endsWith('.json'),
  )) {
    const entries = JSON.parse(
      readFileSync(path.join(directory, file), 'utf8'),
    ).result
    for (const entry of entries.filter(
      (script: { url: string }) => script.url === pathToFileURL(bin).href,
    )) {
      coverage.merge(
        await convert({
          code,
          ast: parse(code, { ecmaVersion: 'latest', locations: true }),
          coverage: entry,
          wrapperLength: 0,
        }),
      )
    }
  }
  expect(coverage.files()).toEqual([bin])
  const summary = coverage.getCoverageSummary()
  for (const metric of [
    'lines',
    'statements',
    'functions',
    'branches',
  ] as const) {
    expect(summary[metric].pct, `bin/nwsapi.js ${metric} coverage`).toBe(100)
  }
})

test('the compiled help runs without repository sources or optional peers', t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-cli-help-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  for (const file of ['dist/bin/nwsapi.js', 'dist/cli.js'] as const) {
    const target = path.join(directory, file)
    mkdirSync(path.dirname(target), { recursive: true })
    const source = new URL(`../../../${file}`, import.meta.url)
    const code = readFileSync(source, 'utf8')
    const program = parse(code, { ecmaVersion: 'latest' })
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') {
        return
      }
      if (Array.isArray(node)) {
        node.forEach(visit)
        return
      }
      const value = node as { type?: string; value?: unknown }
      if (value.type === 'Literal' && typeof value.value === 'string') {
        expect(value.value.endsWith('.mts')).toBe(false)
      }
      Object.values(node).forEach(visit)
    }
    visit(program)
    copyFileSync(source, target)
  }
  const result = spawnSync(process.execPath, ['dist/bin/nwsapi.js', '--help'], {
    cwd: directory,
    encoding: 'utf8',
  })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('Usage: nwsapi <command>')
})
