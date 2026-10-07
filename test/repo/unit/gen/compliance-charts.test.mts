import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import { summarizeCompliance } from '../../../../scripts/repo/gen/compliance-charts.mts'

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

test.each(['valid', 'stale', 'boundaries'])(
  'publishing checks %s evidence and writes parsed charts',
  async mode => {
    vi.resetModules()
    const { comparison, wpt } = fixture()
    const write = vi.fn()
    vi.doMock('node:fs', () => ({
      readFileSync: (file: string) => {
        if (file.endsWith('selector-compatibility.json')) {
          return JSON.stringify(comparison)
        }
        if (file.endsWith('wpt-summary.json')) {
          return JSON.stringify(wpt)
        }
        if (file.endsWith('.md')) {
          return mode === 'boundaries'
            ? ''
            : '<!-- compliance-summary:start --><!-- compliance-summary:end -->'
        }
        return 'compiled engine'
      },
      writeFileSync: write,
    }))
    vi.doMock('node:crypto', () => ({
      createHash: () => ({
        update: () => ({
          digest: () => (mode === 'stale' ? 'other-build' : 'same-build'),
        }),
      }),
    }))
    vi.doMock('../../../../scripts/repo/gen/chart-references.mts', () => ({
      refreshChartReferences: vi.fn(),
    }))
    vi.doMock('../../../../scripts/repo/lib/run-node.mts', () => ({
      isMainModule: () => mode === 'valid',
    }))
    vi.doMock('../../../../scripts/repo/browser.mts', () => ({
      CHROME_VERSION: '154.0.8037.0',
    }))
    const { writeComplianceCharts } =
      await import('../../../../scripts/repo/gen/compliance-charts.mts')
    if (mode !== 'valid') {
      expect(writeComplianceCharts).toThrow()
      expect(write).toHaveBeenCalledTimes(mode === 'stale' ? 0 : 3)
    } else {
      expect(write).toHaveBeenCalledTimes(4)
      const report = JSON.parse(write.mock.calls[0]![1])
      expect(report.native.total).toBe(5)
      for (let i = 1; i < 3; i += 1) {
        const dom = new JSDOM(write.mock.calls[i]![1], {
          contentType: 'image/svg+xml',
        })
        expect(dom.window.document.documentElement.getAttribute('role')).toBe(
          'img',
        )
        expect(
          dom.window.document.querySelectorAll('rect[height="6"]'),
        ).toHaveLength(4)
        dom.window.close()
      }
    }
    vi.doUnmock('node:fs')
    vi.doUnmock('node:crypto')
    vi.doUnmock('../../../../scripts/repo/gen/chart-references.mts')
    vi.doUnmock('../../../../scripts/repo/lib/run-node.mts')
    vi.doUnmock('../../../../scripts/repo/browser.mts')
  },
)

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

test('reviewed extensions stay visible without counting as native passes or failures', () => {
  const { comparison, wpt } = fixture()
  const extension = {
    selector: ':lang("en")',
    native: { error: 'SyntaxError' },
    nwsapi: { value: ['one'] },
    competitor: { error: 'SyntaxError' },
  }
  const result = summarizeCompliance(
    { ...comparison, matrix: [...comparison.matrix, extension] },
    wpt,
  )
  expect(result.total).toBe(6)
  expect(result.native.total).toBe(5)
  expect(result.extensions).toEqual([
    {
      ...extension,
      kind: 'standard',
      specification: 'https://drafts.csswg.org/selectors/#lang-pseudo',
    },
  ])
})

test('new native support automatically returns reviewed syntax to the parity pool', () => {
  const { comparison, wpt } = fixture()
  const extension = {
    selector: ':lang("en")',
    native: { value: ['one'] },
    nwsapi: { value: [] },
    competitor: { value: ['one'] },
  }
  const result = summarizeCompliance(
    { ...comparison, matrix: [...comparison.matrix, extension] },
    wpt,
  )
  expect(result.extensions).toEqual([])
  expect(result.native.total).toBe(6)
  expect(result.native.onlyCompetitor).toBe(2)
})

test('unreviewed syntax disagreements cannot disappear into the extension pool', () => {
  const { comparison, wpt } = fixture()
  const result = summarizeCompliance(
    {
      ...comparison,
      matrix: [
        {
          selector: ':made-up',
          native: { error: 'SyntaxError' },
          nwsapi: { value: [] },
          competitor: { error: 'SyntaxError' },
        },
      ],
    },
    wpt,
  )
  expect(result.extensions).toEqual([])
  expect(result.native.onlyCompetitor).toBe(2)
})
