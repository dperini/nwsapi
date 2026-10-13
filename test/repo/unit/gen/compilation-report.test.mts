import { JSDOM } from 'jsdom'
import type * as Fs from 'node:fs'
import { readFileSync } from 'node:fs'
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
  const inputs = [
    'compilation-followup-2026-10-01.json',
    'preparation-2026-10-01.json',
  ].flatMap(
    file =>
      JSON.parse(
        readFileSync(
          new URL(`../../../../assets/repo/bench/${file}`, import.meta.url),
          'utf8',
        ),
      ).rows as Array<{ operation: string; name: string; selector: string }>,
  )
  expect(
    Array.from(rows, row => ({
      operation: row.getAttribute('data-operation'),
      name: row.querySelector('th')?.firstChild?.textContent,
      selector: row.querySelector('code')?.textContent,
    })),
  ).toEqual(
    inputs.map(row => ({
      operation: row.operation,
      name: row.name,
      selector: row.selector,
    })),
  )
  for (let i = 0, length = rows.length; i < length; i += 1) {
    expect(rows[i]!.querySelectorAll('td')).toHaveLength(4)
  }
  expect(dom.window.document.querySelectorAll('.metric')).toHaveLength(8)
  dom.window.close()
})
