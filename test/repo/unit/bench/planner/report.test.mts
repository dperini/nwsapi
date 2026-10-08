import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  failing: false,
  uniformlySlow: false,
  scenario: 'union',
  ac: true,
  after: true,
  rounds: true,
  write: vi.fn(),
  view: vi.fn(
    (_input: string, _results: unknown, _promote: boolean) =>
      '<div id="choices"></div>',
  ),
  read: vi.fn(),
  mkdir: vi.fn(),
}))
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  writeFileSync: state.write,
  mkdirSync: state.mkdir,
}))
vi.mock('../../../../../scripts/repo/bench/charts.mts', () => ({
  escapeText: (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;'),
}))
vi.mock('../../../../../scripts/repo/bench/planner/decision.mts', () => ({
  decisionView: state.view,
}))

test('planner report records host promotion gates and renders evaluation and repeated confirmation evidence', async () => {
  const original = process.argv
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.read.mockImplementation((file: string) => {
    if (file.endsWith('shared-model.json')) {
      return JSON.stringify({ expression: 'count < total' })
    }
    const rows = [
      {
        id: '<first>',
        family: '<small>',
        split: 'train',
        costs: [1000, state.uniformlySlow ? 1100 : 500],
      },
      {
        id: 'second',
        family: 'large',
        split: 'holdout',
        costs: [1000, state.uniformlySlow ? 1100 : state.failing ? 1200 : 500],
      },
    ]
    return JSON.stringify({
      metadata: {
        host: file.includes('chromium') ? 'chromium' : 'jsdom',
        scenario: state.scenario,
        version: 'fixture',
        cpu: 'fixture',
        power: state.ac ? "Now drawing from 'AC Power'" : 'Battery',
        powerAfter: state.after ? "Now drawing from 'AC Power'" : undefined,
        settings: state.rounds ? { rounds: 9 } : undefined,
        candidateSha256: 'fixture',
      },
      rows,
    })
  })
  const load = async (args: string[]) => {
    vi.resetModules()
    process.argv = [original[0]!, 'planner/report.mts', ...args]
    await import('../../../../../scripts/repo/bench/planner/report.mts')
  }
  try {
    await load(['/fixture/input', '/fixture/report.html'])
    let summary = JSON.parse(state.write.mock.calls[0]![1])
    assert.deepEqual(
      summary.hosts.map((host: { passes: boolean }) => host.passes),
      [true, true],
    )
    const dom = new JSDOM(state.write.mock.calls[1]![1])
    assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 4)
    assert.equal(
      dom.window.document.querySelector('.group h3')!.textContent,
      '<small>',
    )
    dom.window.close()
    state.failing = true
    state.scenario = 'has'
    state.after = false
    state.rounds = false
    await load(['/fixture/input', '/fixture/report.html', 'evaluation'])
    summary = JSON.parse(state.write.mock.calls[2]![1])
    assert.deepEqual(
      summary.hosts.map((host: { passes: boolean }) => host.passes),
      [false, false],
    )
    state.failing = false
    state.after = true
    await load(['/fixture/input', '/fixture/report.html', 'confirmation'])
    assert.equal(state.view.mock.calls[0]![2], true)
    state.failing = true
    state.ac = false
    await load([
      '/fixture/input',
      '/fixture/report.html',
      'confirmation-repeat',
    ])
    assert.equal(state.view.mock.calls[1]![2], false)
    assert.ok(
      state.write.mock.calls[6]![0].endsWith(
        '/confirmation-repeat-summary.json',
      ),
    )
    const repeat = new JSDOM(state.write.mock.calls[7]![1])
    assert.ok(repeat.window.document.querySelector('#choices'))
    repeat.window.close()
    state.uniformlySlow = true
    await load(['/fixture/input', '/fixture/report.html'])
    const slow = JSON.parse(state.write.mock.calls.at(-2)![1])
    assert.equal(slow.hosts[0].passes, false)
    assert.ok(slow.hosts[0].worst <= 1.15)
    await assert.rejects(load([]))
    await assert.rejects(load(['/fixture/input']))
  } finally {
    process.argv = original
    vi.resetModules()
  }
})
