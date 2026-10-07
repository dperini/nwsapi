import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test, vi } from 'vitest'
import {
  invokeMainModule,
  missingMainArguments,
} from '../../../main-module.mts'
const state = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  mismatch: '',
}))
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  writeFileSync: state.write,
}))
import { runtimeReport } from '../../../../../../../scripts/repo/bench/planner/dispatch/runtime/report.mts'

function fixtures() {
  state.read.mockImplementation((file: string) => {
    const repeat = file.includes('/repeat/')
    const metrics = [100, 101, 100, repeat ? 120 : 80].map(
      (geometricTimePercent, index) => ({
        label: `variant<${index}>&`,
        cases: 8,
        geometricTimePercent,
        totalTimePercent: geometricTimePercent,
        worstTimeRatio: 1.2,
      }),
    )
    const rows = Array.from({ length: 8 }, (_, index) => ({
      id: `case<${index}>`,
      fixtureSha256:
        repeat && state.mismatch === 'fixtures' ? 'changed' : 'fixture',
      costs: [100, 110, 50 + index * 10, 150],
    }))
    return JSON.stringify({
      metadata: {
        variants:
          repeat && state.mismatch === 'variants'
            ? ['changed']
            : ['old', 'off', 'on', 'cache'],
        power: 'AC',
        powerAfter: 'AC',
      },
      rows,
      summaries: {
        all: metrics,
        older: metrics,
        crossed: metrics,
        diagnostic: metrics,
      },
    })
  })
}

test('runtime report combines matched passes, paired bars and six sorted outliers per host', () => {
  fixtures()
  runtimeReport(
    '/fixture/first',
    '/fixture/repeat',
    '/fixture/report.html',
    '/fixture/quality',
  )
  const dom = new JSDOM(state.write.mock.calls[0]![1])
  try {
    const document = dom.window.document
    assert.equal(document.querySelectorAll('.run').length, 64)
    assert.equal(
      document.querySelector('section h3')!.textContent,
      'variant<0>&',
    )
    assert.equal(document.querySelectorAll('tbody tr').length, 12)
    assert.equal(document.querySelector('tbody td')!.textContent, 'case<7>')
    assert.equal(
      document.querySelector('tbody td:nth-child(3)')!.textContent,
      '120.0%',
    )
  } finally {
    dom.window.close()
  }
  runtimeReport('/fixture/repeat', '/fixture/first', '/fixture/reversed.html')
  const failures = ['variants', 'fixtures']
  for (let index = 0, length = failures.length; index < length; index += 1) {
    state.mismatch = failures[index]!
    assert.throws(
      () =>
        runtimeReport(
          '/fixture/first',
          '/fixture/repeat',
          '/fixture/report.html',
        ),
      { code: 'ERR_ASSERTION' },
    )
  }
  state.mismatch = ''
})

test('runtime report CLI handles help, each missing operand and the optional quality pass', async () => {
  fixtures()
  const load = () =>
    import('../../../../../../../scripts/repo/bench/planner/dispatch/runtime/report.mts')
  const subject = '/planner/dispatch/runtime/report.mts'
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await invokeMainModule(load, ['--help'], subject)
  await missingMainArguments(
    load,
    [[], ['first'], ['first', 'repeat']],
    subject,
  )
  await invokeMainModule(
    load,
    [
      '/fixture/first',
      '/fixture/repeat',
      '/fixture/cli.html',
      '/fixture/quality',
    ],
    subject,
  )
  assert.equal(state.write.mock.calls.at(-1)![0], '/fixture/cli.html')
})
