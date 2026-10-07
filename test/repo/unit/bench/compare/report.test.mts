import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
}))
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  readdirSync: state.list,
}))
vi.mock('../../../../../scripts/repo/bench/compare/options.mts', () => ({
  writeReport: state.write,
}))

test('validation report filters sorted timing inputs and compares matched round costs', async () => {
  state.list.mockReturnValue([
    'other-timing.json',
    'validation-z-timing.json',
    'validation-a-memory.json',
    'validation-a-timing.json',
  ])
  state.read.mockReturnValue(
    JSON.stringify({
      hashes: ['old', 'new'],
      rows: [
        {
          matches: 1,
          selector: 'i',
          measurements: [
            [
              { round: 0, p50Ns: 100 },
              { round: 1, p50Ns: 200 },
            ],
            [
              { round: 1, p50Ns: 100 },
              { round: 0, p50Ns: 50 },
            ],
          ],
        },
      ],
    }),
  )
  await import('../../../../../scripts/repo/bench/compare/report.mts')
  const [output, report] = state.write.mock.calls[0]!
  assert.ok(output.endsWith('/validation-summary.json'))
  assert.deepEqual(
    report.reports.map((entry: { file: string }) => entry.file),
    ['validation-a-timing.json', 'validation-z-timing.json'],
  )
  assert.equal(report.reports[0].sha256.length, 64)
  assert.deepEqual(report.reports[0].hashes, ['old', 'new'])
  assert.equal(report.reports[0].rows[0].comparison.relativeChange.median, -0.5)
  assert.equal(report.reports[0].rows[0].comparison.rounds.length, 2)
})
