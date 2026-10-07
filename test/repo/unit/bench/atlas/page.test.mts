import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { atlasPage } from '../../../../../scripts/repo/bench/atlas/page.mts'
import type { Report } from '../../../../../scripts/repo/bench/atlas/model.mts'

test('atlas page filters measured cases by category and selector without network access', () => {
  const report: Report = {
    metadata: {
      engines: [{ name: 'nwsapi 3' }, { name: 'other 2' }],
      timestamp: '2026-10-07',
      rounds: 3,
    },
    rows: [
      {
        category: 'class',
        selector: '.a',
        milliseconds: [1, 2],
        errors: [null, null],
      },
      {
        category: 'id',
        selector: '#b',
        milliseconds: [2, 1],
        errors: [null, null],
      },
      {
        category: 'unknown',
        selector: '<unsafe>',
        milliseconds: [null, null],
        errors: ['unsupported', null],
      },
    ],
  }
  const panels = [{ category: 'class', file: 'class.svg', selectors: ['.a'] }]
  const dom = new JSDOM(atlasPage(report, panels, 'input-hash'), {
    runScripts: 'dangerously',
  })
  const { document, Event } = dom.window
  try {
    const select = document.querySelector<HTMLSelectElement>('#category')!
    const search = document.querySelector<HTMLInputElement>('#search')!
    assert.equal(
      document.querySelector('#visible')!.textContent,
      '3 cases shown',
    )
    assert.equal(
      document.querySelector('figure img')!.getAttribute('src'),
      'class.svg',
    )
    select.value = 'class'
    select.dispatchEvent(new Event('change'))
    assert.equal(
      document.querySelector('#visible')!.textContent,
      '1 cases shown',
    )
    assert.equal(
      (document.querySelector('figure') as HTMLElement).hidden,
      false,
    )
    select.value = ''
    search.value = '#B'
    search.dispatchEvent(new Event('input'))
    assert.equal(
      document.querySelector('#visible')!.textContent,
      '1 cases shown',
    )
    assert.equal((document.querySelector('figure') as HTMLElement).hidden, true)
    search.value = 'missing'
    search.dispatchEvent(new Event('input'))
    assert.equal(
      document.querySelector('#visible')!.textContent,
      '0 cases shown',
    )
    assert.equal(
      document.querySelector('tbody tr:last-child code')!.textContent,
      '<unsafe>',
    )
  } finally {
    dom.window.close()
  }
  const detailed = new JSDOM(
    atlasPage(
      {
        ...report,
        metadata: {
          ...report.metadata,
          runtime: 'node',
          host: 'jsdom',
          cpu: 'cpu',
          power: 'AC',
          candidateSha256: 'candidate',
          timingEngine: 'warm batches',
        },
      },
      [],
      'hash',
    ),
  )
  assert.equal(detailed.window.document.querySelectorAll('figure').length, 0)
  detailed.window.close()
})
