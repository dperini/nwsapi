import { expect, test } from 'vitest'
import { summarizeCompliance } from '../../../scripts/repo/gen/compliance-charts.mts'

function fixture() {
  const native = { value: ['one', 'two'] }
  const mismatch = { value: ['two', 'one'] }
  return {
    comparison: {
      browser: '154.0.8037.0',
      versions: { nwsapi: 'candidate', competitor: 'comparison' },
      hashes: { nwsapi: 'same-build' },
      matrix: [{ native, nwsapi: native, competitor: native }],
      userState: [{ rows: [{ native, nwsapi: native, competitor: mismatch }] }],
      transitions: [{ native, nwsapi: mismatch, competitor: native }],
      interest: { rows: [{ native, nwsapi: mismatch, competitor: mismatch }] },
      xml: [
        {
          rows: [
            {
              native: { error: 'SyntaxError' },
              nwsapi: { error: 'SyntaxError' },
              competitor: native,
            },
          ],
        },
      ],
    },
    wpt: {
      browser: '154.0.8037.0',
      wptRevision: 'pinned-revision',
      engineSha256: 'same-build',
      pages: [
        {
          path: 'upstream.html',
          origin: 'upstream',
          total: 10,
          passed: 8,
          knownFailures: ['a', 'b'],
        },
        {
          path: 'local.html',
          origin: 'local',
          total: 2,
          passed: 2,
          knownFailures: [],
        },
      ],
    },
  }
}

test('counts each comparison context and preserves ordered-result disagreements', () => {
  const { comparison, wpt } = fixture()
  const result = summarizeCompliance(comparison, wpt)
  expect(result.native).toEqual({
    total: 5,
    nwsapi: 3,
    competitor: 2,
    both: 1,
    onlyNwsapi: 2,
    onlyCompetitor: 1,
    neither: 1,
  })
  expect(result.upstream).toEqual({
    pages: 1,
    total: 10,
    passed: 8,
    knownFailures: 2,
  })
  expect(result.local).toEqual({
    pages: 1,
    total: 2,
    passed: 2,
    knownFailures: 0,
  })
})

test.each(['browser', 'engineSha256'] as const)(
  'rejects mismatched %s provenance',
  key => {
    const { comparison, wpt } = fixture()
    wpt[key] = 'different'
    expect(() => summarizeCompliance(comparison, wpt)).toThrow()
  },
)

test('rejects duplicate pages instead of inflating the pass count', () => {
  const { comparison, wpt } = fixture()
  wpt.pages.push(wpt.pages[0]!)
  expect(() => summarizeCompliance(comparison, wpt)).toThrow()
})

test('rejects known failures counted as passes', () => {
  const { comparison, wpt } = fixture()
  wpt.pages[0]!.passed = 10
  expect(() => summarizeCompliance(comparison, wpt)).toThrow()
})

test('rejects empty evidence', () => {
  const { comparison, wpt } = fixture()
  wpt.pages = []
  expect(() => summarizeCompliance(comparison, wpt)).toThrow()
})

test('rejects a missing outcome rather than treating missing values as agreement', () => {
  const { comparison, wpt } = fixture()
  Reflect.deleteProperty(comparison.matrix[0]!, 'native')
  expect(() => summarizeCompliance(comparison, wpt)).toThrow()
})
