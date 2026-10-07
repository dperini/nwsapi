import { invoke, state } from './fixture.mts'
import { expect, test } from 'vitest'
test.each(['adjacent', 'separated', 'nested'])(
  'real grouped queries preserve ordered identities layout=%s',
  async layout => {
    await invoke('node', [
      '--output',
      '/report.json',
      '--layout',
      layout,
      '--baseline',
      'dist/nwsapi.js',
      '--memory',
    ])
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(report.rows).toHaveLength(8)
    expect(report.rows.map((row: { matches: number }) => row.matches)).toEqual([
      0, 0, 1, 1, 16, 16, 256, 256,
    ])
    expect(
      report.rows.every(
        (row: { variants: unknown[] }) => row.variants.length === 2,
      ),
    ).toBe(true)
    expect(state.memory).toHaveBeenCalledTimes(8)
    expect(report.warmups).toBe(1)
    expect(report.batch).toBe(1)
  },
)
test('explicit match counts and single current engine are recorded', async () => {
  await invoke('node', [
    '--output',
    '/report.json',
    '--matches',
    '3',
    '--groups',
    '2',
  ])
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(report.rows).toHaveLength(2)
  expect(report.rows[0].matches).toBe(3)
  expect(report.rows[0].variants[0].name).toBe('current')
  expect(state.memory).not.toHaveBeenCalled()
})
test.each([
  { args: [] },
  { args: ['--output', '/report', '--layout', 'bad'] },
  { args: ['--output', '/report', '--groups', '1'] },
  { args: ['--output', '/report', '--groups', '257'] },
  { args: ['--output', '/report', '--groups', '1.5'] },
  { args: ['--output', '/report', '--matches', '-1'] },
  { args: ['--output', '/report', '--matches', '257'] },
  { args: ['--output', '/report', '--matches', '1.5'] },
])(
  'invalid grouped query options fail without output $args',
  async ({ args }) => {
    await expect(invoke('node', args)).rejects.toThrow()
    expect(state.write).not.toHaveBeenCalled()
  },
)
