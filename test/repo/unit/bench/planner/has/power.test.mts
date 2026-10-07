import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'

const state = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
import {
  checkedPower,
  powerState,
} from '../../../../../../scripts/repo/bench/planner/has/power.mts'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

test('power snapshots trim platform tool output and enforce an explicitly requested AC requirement', () => {
  vi.stubGlobal('process', { ...process, platform: 'darwin' })
  const ac = "Now drawing from 'AC Power'"
  state.execute.mockReturnValue(' ' + ac + '\n')
  vi.stubEnv('NWSAPI_REQUIRE_AC', '0')
  assert.equal(powerState(), ac)
  assert.equal(checkedPower(), ac)
  assert.deepEqual(state.execute.mock.calls[0]!.slice(0, 2), [
    '/usr/bin/pmset',
    ['-g', 'batt'],
  ])
  vi.stubEnv('NWSAPI_REQUIRE_AC', '1')
  assert.equal(checkedPower(), ac)
  state.execute.mockReturnValue("Now drawing from 'Battery Power'")
  assert.throws(() => checkedPower())
})

test('platforms without the macOS power tool retain an explicit unknown measurement state', () => {
  vi.stubGlobal('process', { ...process, platform: 'linux' })
  vi.stubEnv('NWSAPI_REQUIRE_AC', '0')
  assert.equal(powerState(), 'unknown')
  assert.equal(checkedPower(), 'unknown')
  assert.equal(state.execute.mock.calls.length, 0)
  vi.stubEnv('NWSAPI_REQUIRE_AC', '1')
  assert.throws(() => checkedPower())
})
