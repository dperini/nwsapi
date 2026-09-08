import { execFileSync, spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'

test(
  'compiler inspection reports source, modes, helper bindings and identity selection',
  { timeout: 30_000 },
  () => {
    const inspect = (...args: string[]) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ['bin/nwsapi', 'compile', '--json', ...args],
          { encoding: 'utf8' },
        ),
      )
    const selection = inspect('div:nth-child(2n)')
    expect(selection.source).toContain('function Resolver(')
    expect(selection.helpers).toContain('s.nthElement')
    expect(selection.sourceBytes).toBe(Buffer.byteLength(selection.source))
    expect(inspect('--mode', 'match', '.card').mode).toBe('match')
    expect(inspect('--mode', 'item', '.card').source).toContain('c.item(')
    expect(inspect('--legacy', '.card').legacy).toBe(true)
    expect(inspect('*').source).toBeNull()
    expect(
      spawnSync(process.execPath, [
        'bin/nwsapi',
        'compile',
        '--mode',
        'invalid',
        'div',
      ]).status,
    ).not.toBe(0)
    expect(
      spawnSync(process.execPath, ['bin/nwsapi', 'compile', ':unknown-pseudo'])
        .status,
    ).not.toBe(0)
  },
)

test(
  'CLI dispatches commands and parses flags and literal selectors',
  { timeout: 30_000 },
  () => {
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ['bin/nwsapi', ...args], { encoding: 'utf8' })
    expect(run().stdout).toContain('Usage: nwsapi <command>')
    expect(run('--help').status).toBe(0)
    expect(run('compile', '-h').stdout).toContain('--mode')
    const unknown = run('unknown')
    expect(unknown.status).toBe(1)
    expect(unknown.stderr).toContain('Unknown command "unknown"')
    for (const args of [
      [],
      ['--mode'],
      ['--unknown', 'div'],
      ['div', 'span'],
    ]) {
      expect(run('compile', ...args).status).toBe(1)
    }
    const compiled = run('compile', '-j', '--mode=match', '--', '.card')
    expect(compiled.status, compiled.stderr).toBe(0)
    expect(JSON.parse(compiled.stdout)).toMatchObject({
      selector: '.card',
      mode: 'match',
    })
  },
)
