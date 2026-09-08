import { readFileSync, writeFileSync } from 'node:fs'
import {
  chartBackground,
  chartGradients,
  chartFrame,
  chartTextStyles,
} from '../bench/chart-theme.mts'
import { escapeText, unitText, packageText } from '../bench/charts.mts'
import { kib } from '../bench/footprint-shared.mts'
import { optimiseSvg } from './svg-optimize.mts'
import { refreshChartReferences } from './chart-references.mts'

const root = new URL('../../../assets/repo/bench/', import.meta.url)
interface Summary {
  median: number
  min: number
  max: number
}
const memory: {
  metadata: { runtime: string; count: number; queries: number; rounds: number }
  rows: Array<{
    engine: string
    initialized: Summary
    queried: Summary
    cacheGrowth: Summary
  }>
} = JSON.parse(readFileSync(new URL('memory-footprint.json', root), 'utf8'))
const sizes: {
  rows: Array<{ engine: string; bytes: number; gzip: number; brotli: number }>
} = JSON.parse(readFileSync(new URL('file-size.json', root), 'utf8'))
if (!memory.metadata.runtime?.startsWith('Chromium')) {
  throw new Error('Memory marketing requires standalone browser measurements.')
}

function render(
  title: string,
  names: string[],
  groups: Array<{ label: string; values: number[] }>,
  notes: string[],
) {
  const body = groups
    .map((group, index) => {
      const top = 155 + index * 140
      const max = Math.max(...group.values)
      if (group.values.some(value => !Number.isFinite(value) || value <= 0)) {
        throw new Error('Footprint charts require positive measurements.')
      }
      return (
        `<text x="48" y="${top}" class="code" style="font-weight:600">${escapeText(group.label)}</text>` +
        group.values
          .map(
            (value, series) =>
              `<g><title>${escapeText(names[series]!)}: ${kib(value)}</title><text x="48" y="${top + 37 + series * 32}" class="code engine">${escapeText(names[series]!)}</text><path d="M410 ${top + 32 + series * 32}h490" stroke="#223048" stroke-width="2"/><rect x="410" y="${top + 31 + series * 32}" width="${(value / max) * 490}" height="2" fill="url(#series${series})"/><text x="930" y="${top + 37 + series * 32}" class="muted">${unitText(kib(value))}</text></g>`,
          )
          .join('')
      )
    })
    .join('')
  return (
    optimiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="720" viewBox="0 0 1100 720" role="img"><title>${escapeText(title)}</title><desc>${escapeText(notes.join(' '))} Lower is better. Each group has its own zero-based linear scale.</desc><defs>${chartBackground}${chartGradients}</defs><style>${chartTextStyles}.engine{font-size:16px}</style>${chartFrame(720)}<text x="48" y="58" class="chart-title">${escapeText(title)}</text><text x="48" y="90" class="muted">Standalone libraries · Lower is better · Each group starts at zero</text>${body}<path d="M48 582H1052" stroke="#304159"/>${notes.map((note, i) => `<text x="${i ? 1052 : 48}" y="${616 + i * 28}"${i ? ' text-anchor="end"' : ''} class="muted note${i ? ' metadata' : ''}">${packageText(note)}</text>`).join('')}</svg>`,
    ) + '\n'
  )
}

writeFileSync(
  new URL('memory-footprint.svg', root),
  render(
    'Memory footprint',
    memory.rows.map(row => row.engine.toLowerCase()),
    [
      {
        label: 'Initialized engine',
        values: memory.rows.map(row => row.initialized.median),
      },
      {
        label: `Engine after ${memory.metadata.queries} distinct queries`,
        values: memory.rows.map(row => row.queried.median),
      },
      {
        label: 'Additional retained heap from queries',
        values: memory.rows.map(row => row.cacheGrowth.median),
      },
    ],
    [
      'Retained JavaScript heap per engine after garbage collection. Native DOM allocation is excluded.',
      `${memory.metadata.runtime} · ${memory.metadata.count} engines per sample · Median of ${memory.metadata.rounds} rounds · No jsdom`,
      'Both libraries are loaded before the baseline. Raw samples and methodology: docs/benchmarks.md.',
    ],
  ),
)
writeFileSync(
  new URL('file-size.svg', root),
  render(
    'Browser file size',
    sizes.rows.map(row => row.engine.toLowerCase()),
    [
      {
        label: 'Minified JavaScript',
        values: sizes.rows.map(row => row.bytes),
      },
      { label: 'Gzip', values: sizes.rows.map(row => row.gzip) },
      { label: 'Brotli', values: sizes.rows.map(row => row.brotli) },
    ],
    [
      'NWSAPI core browser file versus the full comparison library bundle, including its runtime dependencies.',
      'Same Rolldown minifier · Gzip level 9 · Brotli quality 11 · No jsdom or tree shaking',
      'Excludes the NWSAPI CLI, jsdom adapter and optional css-tree peer. This is a file size report, not timing.',
    ],
  ),
)
refreshChartReferences()
