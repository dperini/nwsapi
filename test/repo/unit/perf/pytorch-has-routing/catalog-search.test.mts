import { expect, test } from 'vitest'
import {
  getHighlightRanges,
  searchDocument,
} from '../../../../../docs/repo/perf/pytorch-has-routing/catalog-search.mts'
import type { IndexedDocument } from '../../../../../docs/repo/perf/pytorch-has-routing/catalog-index.mts'

function document(title: string, body = ''): IndexedDocument {
  return {
    path: 'example.md',
    title,
    body,
    summary: '',
    category: 'Reference',
    type: 'Guide',
    sections: [],
  }
}

test.each([
  'NEURAL_PLANNER',
  'neural planner',
  'NeUrAl-PlAnNeR',
  'neural  planner',
  'nueral planner',
  'neural plannner',
  'neural planne',
  'neural plannor',
  'planner neural',
])('finds identifier variants and single-edit queries: %s', query => {
  expect(
    searchDocument(document('NEURAL_PLANNER'), query)?.document.title,
  ).toBe('NEURAL_PLANNER')
})

test('exact body matches outrank fuzzy titles', () => {
  const exact = searchDocument(
    document('Configuration', 'The route planner is on.'),
    'route planner',
  )!
  const fuzzy = searchDocument(document('Route plannner'), 'route planner')!
  expect(exact.rank).toBeLessThan(fuzzy.rank)
  expect(exact.excerpt).toContain('route planner')
})

test('title, summary, and section scopes retain their priority', () => {
  const title = document('Route planner')
  const summary = { ...document('Configuration'), summary: 'Route planner' }
  const section = {
    ...document('Configuration'),
    sections: [{ id: 'route', title: 'Route planner', text: 'Some details.' }],
  }
  expect(searchDocument(title, 'route planner')!.rank).toBeLessThan(
    searchDocument(summary, 'route planner')!.rank,
  )
  expect(searchDocument(summary, 'route planner')!.rank).toBeLessThan(
    searchDocument(section, 'route planner')!.rank,
  )
  expect(searchDocument(section, 'route planner')!.section?.id).toBe('route')
})

test('selectors stay literal and short words do not get fuzzy corrections', () => {
  expect(searchDocument(document('has support'), ':has()')).toBeUndefined()
  expect(searchDocument(document(':has() support'), ':has()')).toBeDefined()
  expect(searchDocument(document('cat'), 'car')).toBeUndefined()
  expect(
    searchDocument(document('neural planner'), 'neural banana'),
  ).toBeUndefined()
})

test('folded and fuzzy highlights point into the original text', () => {
  const text = 'Use NEURAL__PLANNER, then neural-planner.'
  const ranges = getHighlightRanges(text, 'neural planner')
  expect(ranges.map(range => text.slice(range.start, range.end))).toEqual([
    'NEURAL__PLANNER',
    'neural-planner',
  ])
  const fuzzy = getHighlightRanges('NEURAL_PLANNER', 'nueral planner')
  expect(
    fuzzy.map(range => 'NEURAL_PLANNER'.slice(range.start, range.end)),
  ).toEqual(['NEURAL', 'PLANNER'])
})

test('Unicode normalization preserves original highlight boundaries', () => {
  for (const text of ['café', 'cafe\u0301']) {
    expect(getHighlightRanges(text, 'cafe')).toEqual([
      { start: 0, end: text.length },
    ])
  }
  expect(searchDocument(document('𐐀abcde'), '𐐀abdce')).toBeDefined()
})

test('empty searches list documents and punctuation-only searches stay literal', () => {
  expect(searchDocument(document('Anything'), '   ')?.rank).toBe(0)
  expect(searchDocument(document('Anything'), ':')).toBeUndefined()
})
