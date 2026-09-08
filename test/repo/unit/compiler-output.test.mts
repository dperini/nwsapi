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
          ['bin/nwsapi-compile.mjs', '--json', ...args],
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
        'bin/nwsapi-compile.mjs',
        '--mode',
        'invalid',
        'div',
      ]).status,
    ).not.toBe(0)
    expect(
      spawnSync(process.execPath, ['bin/nwsapi-compile.mjs', ':unknown-pseudo'])
        .status,
    ).not.toBe(0)
  },
)
