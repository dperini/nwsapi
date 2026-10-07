import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  chartBaseUrl,
  chartReference,
  refreshChartReferences,
} from '../../../../scripts/repo/gen/chart-references.mts'

test('chart references use artifact hashes and preserve the same target across document locations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nwsapi-chart-refs-'))
  try {
    const asset = path.join(root, 'assets/repo/bench/perf-hero.svg')
    const readme = path.join(root, 'README.md')
    const guide = path.join(root, 'docs/repo/perf/benchmarks.md')
    fs.mkdirSync(path.dirname(asset), { recursive: true })
    const firstBytes = Buffer.from('<svg/>')
    fs.writeFileSync(asset, firstBytes)
    const first = chartReference(
      'assets/repo/bench/perf-hero.svg',
      readme,
      root,
    )!
    const url = new URL(first)
    expect(url.origin).toBe(new URL(chartBaseUrl).origin)
    expect(url.pathname).toBe(
      '/dperini/nwsapi/refs/heads/prerelease/3.0.0/assets/repo/bench/perf-hero.svg',
    )
    expect(url.searchParams.get('v')).toBe(
      crypto.createHash('sha256').update(firstBytes).digest('hex').slice(0, 12),
    )
    expect(
      chartReference('../../../assets/repo/bench/perf-hero.svg', guide, root),
    ).toBe(first)
    expect(
      chartReference(
        chartBaseUrl + 'assets/repo/bench/perf-hero.svg',
        readme,
        root,
      ),
    ).toBe(first)
    expect(
      chartReference('assets/repo/coverage.svg', readme, root),
    ).toBeUndefined()
    expect(
      chartReference('assets/repo/bench/missing.svg', readme, root),
    ).toBeUndefined()
    expect(
      chartReference('https://example.test/chart.svg', readme, root),
    ).toBeUndefined()
    fs.writeFileSync(asset, '<svg width="1100"/>')
    expect(
      chartReference('assets/repo/bench/perf-hero.svg', readme, root),
    ).not.toBe(first)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('refresh updates asset revisions once and leaves other image references intact', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nwsapi-chart-refresh-'))
  try {
    const asset = path.join(root, 'assets/repo/bench/chart.svg')
    fs.mkdirSync(path.dirname(asset), { recursive: true })
    fs.writeFileSync(asset, '<svg/>')
    const document = path.join(root, 'README.md')
    fs.writeFileSync(
      document,
      '![chart](assets/repo/bench/chart.svg)\n![other](https://example.test/chart.svg)',
    )
    refreshChartReferences(root)
    // Markdown image destinations are the updater's public document interface.
    const destinations = [
      ...fs.readFileSync(document, 'utf8').matchAll(/\]\(([^)]+)\)/g),
    ].map(match => new URL(match[1]!))
    expect(destinations[0]!.searchParams.get('v')).toMatch(/^[a-f0-9]{12}$/)
    expect(destinations[1]!.origin).toBe('https://example.test')
    const firstStat = fs.statSync(document).mtimeMs
    refreshChartReferences(root)
    expect(fs.statSync(document).mtimeMs).toBe(firstStat)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
