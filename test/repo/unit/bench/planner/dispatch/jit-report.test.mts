import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { afterEach, test, vi } from 'vitest'
import { invokeMainModule, missingMainArguments } from '../../main-module.mts'

const state = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  writeFileSync: state.write,
}))
afterEach(() => vi.clearAllMocks())

function measurement(split: number) {
  const metrics = [100, 101, 102, 100, split].map((value, index) => ({
    label: `variant<${index}>&`,
    cases: 96,
    geometricTimePercent: value,
    totalTimePercent: value,
    worstTimeRatio: 1.2,
  }))
  return {
    metadata: {
      variants: ['a', 'b'],
      labels: [],
      power: 'AC<1>',
      powerAfter: 'AC',
      modelCertificate: { sourceSha256: 'abc', proof: 'valid' },
    },
    rows: [{ id: 'a' }],
    summaries: {
      fresh: metrics,
      unfiltered: metrics,
      filtered: metrics,
      reproduction: metrics,
    },
  }
}
function fixtures() {
  state.read.mockImplementation((file: string) =>
    JSON.stringify(
      file.includes('crossed-split')
        ? {
            summaries: Object.fromEntries(
              ['development', 'validation', 'evaluation'].map(group => [
                group,
                { model: { geometricSpeedRatio: 2, passesGate: false } },
              ]),
            ),
          }
        : measurement(file.includes('/repeat/') ? 110 : 90),
    ),
  )
}

test('diagnostic report preserves both passes, encoded labels and recorded confirmation ratios', async () => {
  fixtures()
  const { jitReport } =
    await import('../../../../../../scripts/repo/bench/planner/dispatch/jit-report.mts')
  jitReport('/fixture/first', '/fixture/repeat', '/fixture/report.html')
  assert.equal(state.write.mock.calls[0]![0], '/fixture/report.html')
  const document = new JSDOM(state.write.mock.calls[0]![1]).window.document
  assert.equal(document.querySelectorAll('.variant').length, 40)
  assert.equal(document.querySelectorAll('.run').length, 80)
  assert.equal(document.querySelector('h3')!.textContent, 'variant<0>&')
  assert.equal(document.querySelectorAll('tbody td').length, 8)
  assert.equal(document.querySelectorAll('tbody td')[1]!.textContent, '50.0%')
  assert.ok(
    document.querySelector('.bar')!.getAttribute('style')!.includes('width:'),
  )
  let reads = 0
  state.read.mockImplementation(() => {
    reads += 1
    const data = measurement(90)
    if (reads === 2) {
      data.rows = [{ id: 'changed' }]
    }
    return JSON.stringify(data)
  })
  assert.throws(
    () =>
      jitReport('/fixture/first', '/fixture/repeat', '/fixture/report.html'),
    { code: 'ERR_ASSERTION' },
  )
})

test('diagnostic CLI handles help, each missing argument and complete report generation', async () => {
  fixtures()
  const load = () =>
    import('../../../../../../scripts/repo/bench/planner/dispatch/jit-report.mts')
  const subject = '/planner/dispatch/jit-report.mts'
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await invokeMainModule(load, ['--help'], subject)
  await missingMainArguments(
    load,
    [[], ['first'], ['first', 'repeat']],
    subject,
  )
  await invokeMainModule(
    load,
    ['/fixture/first', '/fixture/repeat', '/fixture/report.html'],
    subject,
  )
  assert.equal(state.write.mock.calls.length, 1)
})
