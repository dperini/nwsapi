import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { refreshChartReferences } from '../../../scripts/repo/gen/chart-references.mts'

test('changes both chart URLs when the SVG changes and preserves other images', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nwsapi-chart-refs-'))
  try {
    const asset = path.join(root, 'assets/repo/bench/perf-hero.svg')
    const readme = path.join(root, 'README.md')
    const guide = path.join(root, 'docs/repo/perf/benchmarks.md')
    fs.mkdirSync(path.dirname(asset), { recursive: true })
    fs.mkdirSync(path.dirname(guide), { recursive: true })
    fs.writeFileSync(asset, '<svg>first</svg>')
    fs.writeFileSync(
      readme,
      '![Chart](assets/repo/bench/perf-hero.svg?v=1)\n![Coverage](assets/repo/coverage.svg?v=keep)\n',
    )
    fs.writeFileSync(
      guide,
      '![Chart](../../../assets/repo/bench/perf-hero.svg)\n',
    )
    refreshChartReferences(root)
    const first = fs.readFileSync(readme, 'utf8')
    expect(first).toContain(
      'https://raw.githubusercontent.com/dperini/nwsapi/master/assets/repo/bench/perf-hero.svg?v=',
    )
    expect(first).toMatch(/perf-hero\.svg\?v=[a-f\d]{12}\)/)
    expect(fs.readFileSync(guide, 'utf8')).toContain(
      first.match(/perf-hero\.svg\?v=[a-f\d]{12}/)![0],
    )
    refreshChartReferences(root)
    expect(fs.readFileSync(readme, 'utf8')).toBe(first)
    fs.writeFileSync(asset, '<svg>updated footer</svg>')
    refreshChartReferences(root)
    const updated = fs.readFileSync(readme, 'utf8')
    expect(updated).not.toBe(first)
    expect(updated).toContain('![Coverage](assets/repo/coverage.svg?v=keep)')
    expect(fs.readFileSync(guide, 'utf8')).toContain(
      updated.match(/perf-hero\.svg\?v=[a-f\d]{12}/)![0],
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
