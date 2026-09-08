import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { createRequire } from 'node:module'

// Load these as Node does in the executable; avoid transforming jsdom's
// dependency graph through the test runner merely to inspect generated text.
const require = createRequire(import.meta.url)
const { inspectSelector } = require('../../../scripts/repo/compile.mts')
const { runCli } = require('../../../scripts/repo/cli.mts')

test('compiler inspection reports source, modes, helper bindings and identity selection', () => {
  const inspect = (selector: string, options = {}) =>
    JSON.parse(inspectSelector(selector, { ...options, json: true }))
  const selection = inspect('div:nth-child(2n)')
  expect(selection.source).toContain('function Resolver(')
  expect(selection.helpers).toContain('s.nthElement')
  expect(selection.sourceBytes).toBe(Buffer.byteLength(selection.source))
  expect(inspect('.card', { mode: 'match' }).mode).toBe('match')
  expect(inspect('.card', { mode: 'item' }).source).toContain('c.item(')
  expect(inspect('.card', { legacy: true }).legacy).toBe(true)
  expect(inspect('*').source).toBeNull()
})

test('CLI dispatches commands and parses flags and literal selectors', async () => {
  expect(await runCli([])).toContain('Usage: nwsapi <command>')
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
  ]) {
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

test('the executable forwards arguments, prints output, and fails on errors', () => {
  // Real process boundaries remain covered; mode/parser permutations run above.
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['bin/nwsapi', ...args], { encoding: 'utf8' })
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
})
