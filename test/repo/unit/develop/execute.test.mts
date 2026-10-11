import { expect, test } from 'vitest'
import { TASKS } from '../../../../scripts/repo/develop/actions.mts'
import { taskResult } from '../../../../scripts/repo/develop/execute.mts'

test.each([
  { code: 0, signal: null, status: 'completed', exitCode: 0 },
  { code: 7, signal: null, status: 'failed', exitCode: 7 },
  { code: null, signal: null, status: 'failed', exitCode: 1 },
  { code: 0, signal: 'SIGINT', status: 'stopped', exitCode: 130 },
  { code: null, signal: 'SIGTERM', status: 'stopped', exitCode: 143 },
] as const)('maps child exit $code and signal $signal', outcome => {
  expect(taskResult(TASKS[0]!, outcome.code, outcome.signal)).toMatchObject({
    status: outcome.status,
    exitCode: outcome.exitCode,
    signal: outcome.signal,
  })
})
