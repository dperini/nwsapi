import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test, vi } from 'vitest'
const state = vi.hoisted(() => ({
  exec: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}))
vi.mock('node:child_process', () => ({ execFileSync: state.exec }))
vi.mock('node:fs', () => ({
  readFileSync: state.read,
  writeFileSync: state.write,
}))
vi.mock('../../../../../scripts/repo/bench/charts.mts', () => ({
  escapeText: (value: string) => value,
}))

test('survey rendering connects section navigation, repository references and scrollable tables', async () => {
  state.exec.mockImplementation((command: string) =>
    command === 'git'
      ? 'fixture-revision\n'
      : '<h2>One & Two!</h2><table><tr><td>value</td></tr></table><a href="../../../README.md">source</a><img src="../../../assets/repo/bench/survey-2026-10-03/plot.svg">',
  )
  state.read.mockReturnValue(JSON.stringify({ rows: [1, 2, 3] }))
  const original = process.argv
  try {
    process.argv = [original[0]!, 'report.mts']
    await import('../../../../../scripts/repo/bench/survey/report.mts')
    const document = new JSDOM(state.write.mock.calls[0]![1]).window.document
    assert.equal(document.querySelector('h2')!.id, 'one-two')
    assert.equal(
      document.querySelector('nav a')!.getAttribute('href'),
      '#one-two',
    )
    assert.equal(
      document.querySelector('.table-scroll')!.getAttribute('role'),
      'region',
    )
    assert.equal(
      document.querySelector('article a')!.getAttribute('href'),
      'https://github.com/dperini/nwsapi/blob/fixture-revision/README.md',
    )
    assert.equal(
      document.querySelector('article img')!.getAttribute('src'),
      'plot.svg',
    )
    assert.equal(document.querySelectorAll('.summary b')[1]!.textContent, '3')
    assert.equal(state.exec.mock.calls[1]![0], 'npx')
    document.defaultView!.close()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.resetModules()
    process.argv = [original[0]!, 'report.mts', '--help']
    await import('../../../../../scripts/repo/bench/survey/report.mts')
    assert.equal(state.write.mock.calls.length, 1)
  } finally {
    process.argv = original
    vi.resetModules()
  }
})
