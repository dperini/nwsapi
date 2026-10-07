import { expect, test } from 'vitest'
import { state, invoke } from './fixture.mts'
test.each(['normal', 'missing', 'empty'])(
  'mutation profiles support %s sample lists',
  async profile => {
    state.profile = profile
    await invoke('mutation', [])
    const report = JSON.parse(state.write.mock.calls[0]?.[1] as string)
    expect(report.rows).toHaveLength(18)
    expect(
      report.rows[0].sites.map((site: { function: string }) => site.function),
    ).toEqual(['second', 'first'])
    expect(state.disconnect).toHaveBeenCalledTimes(2)
  },
)
test.each(['length', 'order', 'after-length', 'after-order'])(
  'identity mismatch %s disconnects the profiler',
  async mode => {
    state.mode = mode
    await expect(invoke('mutation', [])).rejects.toThrow()
    expect(state.disconnect).toHaveBeenCalledOnce()
    expect(state.write).not.toHaveBeenCalled()
  },
)
