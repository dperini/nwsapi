import { JSDOM } from 'jsdom'
import { beforeEach, expect, test, vi } from 'vitest'
const state = vi.hoisted(() => ({ write: vi.fn(), exec: vi.fn() }))
vi.mock('node:fs', () => ({
  readFileSync: () => JSON.stringify({ rows: [{}, {}] }),
  writeFileSync: state.write,
}))
vi.mock('node:child_process', () => ({ execFileSync: state.exec }))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.exec.mockImplementation((command: string) =>
    command === 'git'
      ? 'abc123\n'
      : '<h2>Measured routes</h2><h2>Next steps!</h2><table><tr><td>1</td></tr></table><a href="../style/practices.md">Source</a><img src="../../../assets/repo/bench/survey-2026-10-03/chart.svg"><a href="https://example.test/">Reference</a>',
  )
})
async function invoke(args: string[]) {
  const argv = process.argv
  process.argv = [argv[0]!, '/survey/report.mts', ...args]
  try {
    await import('../../../../../scripts/repo/bench/survey/report.mts')
  } finally {
    process.argv = argv
  }
}
test('survey report renders accessible section links, tables, and source references', async () => {
  await invoke([])
  const dom = new JSDOM(state.write.mock.calls[0]![1] as string)
  try {
    const document = dom.window.document
    expect(
      Array.from(document.querySelectorAll('h2')).map(node => node.id),
    ).toEqual(['measured-routes', 'next-steps'])
    expect(
      Array.from(document.querySelectorAll('nav a')).map(node =>
        node.getAttribute('href'),
      ),
    ).toEqual(['#measured-routes', '#next-steps'])
    expect(
      document.querySelector('.table-scroll')?.getAttribute('tabindex'),
    ).toBe('0')
    expect(document.querySelector('article a')?.getAttribute('href')).toContain(
      '/blob/abc123/docs/repo/style/practices.md',
    )
    expect(document.querySelector('img')?.getAttribute('src')).toBe('chart.svg')
    expect(
      document.querySelector('article a:last-child')?.getAttribute('href'),
    ).toBe('https://example.test/')
    expect(state.exec.mock.calls[1]![1]).toContain('--package=marked@18.0.14')
  } finally {
    dom.window.close()
  }
})
test('survey report help avoids rendering and filesystem output', async () => {
  await invoke(['--help'])
  expect(state.exec).not.toHaveBeenCalled()
  expect(state.write).not.toHaveBeenCalled()
})
