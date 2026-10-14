import assert from 'node:assert/strict'
import { test } from 'node:test'
import { doctorNextCommand, doctorReport } from '../../../../scripts/develop/doctor.mts'

test('doctor recovery and ready actions use direct Node commands', () => {
  const lines: string[] = []
  const report = doctorReport({
    repoRoot: '/missing-onboarding-checkout',
    toolBin: '/missing-onboarding-checkout/.cache/bin',
    statePath: '/missing-onboarding-checkout/.cache/bin/toolchain.json',
    env: { PATH: '' },
    log: line => lines.push(line),
  })
  assert.deepEqual(
    report.toolChecks.map(tool => tool.name),
    ['node', 'npm', 'nub', 'mise'],
  )
  assert.ok(lines.includes('Next command: node scripts/setup.mjs'))
  assert.equal(doctorNextCommand(true), 'node scripts/develop/run.mts')
})
