import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({ write: vi.fn() }))
vi.mock('node:fs', () => ({ writeFileSync: state.write }))
import { writeTimingReport } from '../../../../../scripts/repo/bench/port/report.mts'
beforeEach(() => {
  vi.clearAllMocks()
})
test('timing reports preserve compressed samples and expose compact statistics', () => {
  writeTimingReport('/reports/port.json', {
    host: 'fixture',
    rows: [
      {
        name: 'selection',
        samples: [
          [
            { samplesNs: [1, 2, 3], p50Ns: 2 },
            { samplesNs: [], p50Ns: 0 },
          ],
        ],
      },
    ],
  })
  const archive = state.write.mock.calls[0]![1] as Buffer
  expect(state.write.mock.calls[0]![0]).toBe('/reports/port.samples.json.gz')
  expect(JSON.parse(gunzipSync(archive).toString())).toEqual([
    { name: 'selection', samples: [[[1, 2, 3], []]] },
  ])
  const compact = JSON.parse(state.write.mock.calls[1]![1] as string)
  expect(compact.rawSamples).toEqual({
    file: 'port.samples.json.gz',
    sha256: createHash('sha256').update(archive).digest('hex'),
  })
  expect(compact.rows[0].samples[0][0]).toEqual({
    p50Ns: 2,
    sampleCount: 3,
    minNs: 1,
    maxNs: 3,
  })
  expect(compact.rows[0].samples[0][1]).toEqual({ p50Ns: 0, sampleCount: 0 })
})
