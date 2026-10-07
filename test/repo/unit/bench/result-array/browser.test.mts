import { invoke, state } from './fixture.mts'
import { expect, test } from 'vitest'
test.each(['adjacent', 'separated', 'nested'])(
  'browser grouped queries preserve all ordered counts layout=%s',
  async layout => {
    await invoke('browser', ['dist/nwsapi.js', '/report.json', layout, '4'])
    const report = JSON.parse(state.write.mock.calls[0]![1] as string)
    expect(report.rows).toHaveLength(8)
    expect(report.rows.map((row: { matches: number }) => row.matches)).toEqual([
      0, 0, 1, 1, 16, 16, 256, 256,
    ])
    expect(state.pageClose).toHaveBeenCalledTimes(4)
    expect(state.close).toHaveBeenCalledOnce()
    expect(report.batch).toBe(1)
  },
)
test('browser default layout and groups remain supported', async () => {
  await invoke('browser', ['dist/nwsapi.js', '/report'])
  const report = JSON.parse(state.write.mock.calls[0]![1] as string)
  expect(report.layout).toBe('adjacent')
  expect(report.groups).toBe(4)
})
test.each(['length', 'order'])(
  'invalid %s results close current page and browser',
  async mode => {
    state.mode = mode
    await expect(
      invoke('browser', ['dist/nwsapi.js', '/report']),
    ).rejects.toThrow()
    expect(state.close).toHaveBeenCalledOnce()
    expect(state.write).not.toHaveBeenCalled()
  },
)
test.each([
  { args: [] },
  { args: ['dist/nwsapi.js', '/report', 'bad'] },
  { args: ['dist/nwsapi.js', '/report', 'adjacent', '1'] },
  { args: ['dist/nwsapi.js', '/report', 'adjacent', '257'] },
  { args: ['dist/nwsapi.js', '/report', 'adjacent', '1.5'] },
])('invalid browser arguments avoid launch $args', async ({ args }) => {
  await expect(invoke('browser', args)).rejects.toThrow()
  expect(state.close).not.toHaveBeenCalled()
})
