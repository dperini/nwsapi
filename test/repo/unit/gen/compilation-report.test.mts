import { JSDOM } from 'jsdom'
import type * as Fs from 'node:fs'
import { expect, test, vi } from 'vitest'
const write = vi.hoisted(() => vi.fn())
vi.mock('node:fs', async original => ({
  ...(await original<typeof Fs>()),
  writeFileSync: write,
}))

test('compilation report renders recorded operations and both timing cohorts', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await import('../../../../scripts/repo/gen/compilation-report.mts')
  expect(write).toHaveBeenCalledOnce()
  const [url, html] = write.mock.calls[0]!
  expect(url.pathname).toMatch(/compilation-report\.html$/)
  const dom = new JSDOM(html)
  const rows = dom.window.document.querySelectorAll('tbody tr')
  expect(rows.length).toBeGreaterThan(13)
  for (let i = 0, length = rows.length; i < length; i += 1) {
    expect(rows[i]!.getAttribute('data-operation')).toBeTruthy()
    expect(rows[i]!.querySelectorAll('td')).toHaveLength(4)
  }
  expect(dom.window.document.querySelectorAll('.metric')).toHaveLength(8)
  dom.window.close()
})
