import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { CHROME_VERSION } from '../browser.mts'
import {
  chartBackground,
  chartFrame,
  chartGradients,
  chartTextStyles,
} from '../bench/chart-theme.mts'
import { escapeText } from '../bench/charts.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { refreshChartReferences } from './chart-references.mts'
import { optimiseSvg } from './svg-optimize.mts'

type Outcome = { value: string[] } | { error: string }
interface ComparisonRow {
  native: Outcome
  nwsapi: Outcome
  competitor: Outcome
}
interface Comparison {
  browser: string
  versions: { nwsapi: string; competitor: string }
  hashes: { nwsapi: string }
  matrix: ComparisonRow[]
  userState: Array<{ rows: ComparisonRow[] }>
  transitions: ComparisonRow[]
  interest: { rows: ComparisonRow[] }
  xml: Array<{ rows: ComparisonRow[] }>
}
interface WptReport {
  browser: string
  wptRevision: string
  engineSha256: string
  pages: Array<{
    path: string
    origin: string
    total: number
    passed: number
    knownFailures: string[]
  }>
}

function validOutcome(outcome: unknown): outcome is Outcome {
  if (!outcome || typeof outcome !== 'object') {
    return false
  }
  if ('error' in outcome) {
    return (
      typeof outcome.error === 'string' &&
      !!outcome.error &&
      !('value' in outcome)
    )
  }
  return (
    'value' in outcome &&
    Array.isArray(outcome.value) &&
    outcome.value.every(value => typeof value === 'string')
  )
}

export function summarizeWpt(pages: WptReport['pages']) {
  const upstream = { pages: 0, total: 0, passed: 0, knownFailures: 0 }
  const local = { ...upstream }
  const paths = new Set<string>()
  for (const page of pages) {
    if (
      paths.has(page.path) ||
      !Number.isSafeInteger(page.total) ||
      page.total < 1 ||
      !Number.isSafeInteger(page.passed) ||
      page.passed < 0 ||
      page.passed + page.knownFailures.length !== page.total
    ) {
      throw new Error(
        'WPT counts must cover each page exactly once without counting known failures as passes.',
      )
    }
    paths.add(page.path)
    const group = page.origin === 'local' ? local : upstream
    group.pages++
    group.total += page.total
    group.passed += page.passed
    group.knownFailures += page.knownFailures.length
  }
  return { upstream, local }
}

export function summarizeCompliance(comparison: Comparison, wpt: WptReport) {
  if (
    comparison.browser !== wpt.browser ||
    comparison.hashes.nwsapi !== wpt.engineSha256
  ) {
    throw new Error(
      'Compliance reports must use the same browser and engine build.',
    )
  }
  const rows = [
    ...comparison.matrix,
    ...comparison.userState.flatMap(state => state.rows),
    ...comparison.transitions,
    ...comparison.interest.rows,
    ...comparison.xml.flatMap(fixture => fixture.rows),
  ]
  if (!rows.length || !wpt.pages.length) {
    throw new Error('Compliance reports must contain executed cases.')
  }
  const native = {
    total: rows.length,
    nwsapi: 0,
    competitor: 0,
    both: 0,
    onlyNwsapi: 0,
    onlyCompetitor: 0,
    neither: 0,
  }
  for (const row of rows) {
    if (![row.native, row.nwsapi, row.competitor].every(validOutcome)) {
      throw new Error(
        'Comparison cases require complete outcomes from all three engines.',
      )
    }
    const candidate = isDeepStrictEqual(row.native, row.nwsapi)
    const competitor = isDeepStrictEqual(row.native, row.competitor)
    native.nwsapi += Number(candidate)
    native.competitor += Number(competitor)
    if (candidate && competitor) {
      native.both++
    } else if (candidate) {
      native.onlyNwsapi++
    } else if (competitor) {
      native.onlyCompetitor++
    } else {
      native.neither++
    }
  }
  const { upstream, local } = summarizeWpt(wpt.pages)
  return {
    browser: comparison.browser,
    versions: comparison.versions,
    engineSha256: wpt.engineSha256,
    wptRevision: wpt.wptRevision,
    native,
    upstream,
    local,
  }
}

function complianceChart(
  title: string,
  description: string,
  rows: Array<{ name: string; passed: number; total: number }>,
  notes: string[],
) {
  const body = rows
    .map((row, index) => {
      const y = 164 + index * 92
      const ratio = row.passed / row.total
      return `<g><title>${escapeText(row.name)}: ${row.passed} of ${row.total}</title><text x="48" y="${y}" class="code">${escapeText(row.name)}</text><rect x="430" y="${y - 10}" width="440" height="6" rx="3" fill="#223048"/><rect x="430" y="${y - 10}" width="${440 * ratio}" height="6" rx="3" fill="url(#series${index})"/><text x="1052" y="${y}" text-anchor="end" class="muted">${row.passed.toLocaleString('en-US')} / ${row.total.toLocaleString('en-US')}</text><text x="1052" y="${y + 25}" text-anchor="end" class="metadata">${(ratio * 100).toFixed(1)}%</text></g>`
    })
    .join('')
  const ticks = [0, 25, 50, 75, 100]
    .map(
      value =>
        `<text x="${430 + 4.4 * value}" y="307" text-anchor="middle" class="tick">${value}%</text>`,
    )
    .join('')
  const footer = notes
    .map(
      (note, index) =>
        `<text x="48" y="${354 + index * 25}" class="metadata">${escapeText(note)}</text>`,
    )
    .join('')
  return (
    optimiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="450" viewBox="0 0 1100 450" role="img"><title>${escapeText(title)}</title><desc>${escapeText(description)} Higher is better. Each bar uses a zero-to-100-percent scale.</desc><defs>${chartBackground}${chartGradients}</defs><style>${chartTextStyles}</style>${chartFrame(450)}<text x="48" y="60" class="chart-title">${escapeText(title)}</text><text x="48" y="97" class="muted">${escapeText(description)}</text>${body}${ticks}<path d="M48 328H1052" stroke="#304159"/>${footer}</svg>`,
    ) + '\n'
  )
}

export function writeComplianceCharts() {
  const directory = path.join(REPO_ROOT, 'assets/repo/bench')
  const comparison: Comparison = JSON.parse(
    readFileSync(path.join(directory, 'selector-compatibility.json'), 'utf8'),
  )
  const wpt: WptReport = JSON.parse(
    readFileSync(path.join(directory, 'wpt-summary.json'), 'utf8'),
  )
  const summary = summarizeCompliance(comparison, wpt)
  const currentHash = createHash('sha256')
    .update(readFileSync(path.join(REPO_ROOT, 'dist/nwsapi.js')))
    .digest('hex')
  if (
    summary.engineSha256 !== currentHash ||
    summary.browser !== CHROME_VERSION
  ) {
    throw new Error(
      'Refresh compliance measurements for the current build and pinned browser.',
    )
  }
  writeFileSync(
    path.join(directory, 'compliance-summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  )
  writeFileSync(
    path.join(directory, 'selector-compliance.svg'),
    complianceChart(
      'Selector parsing and matching against Chrome',
      `${summary.native.total} targeted cases · Same ordered results or the same error type`,
      [
        {
          name: 'nwsapi',
          passed: summary.native.nwsapi,
          total: summary.native.total,
        },
        {
          name: '@asamuzakjp/dom-selector',
          passed: summary.native.competitor,
          total: summary.native.total,
        },
      ],
      [
        `Chrome ${summary.browser} · nwsapi ${summary.versions.nwsapi} · @asamuzakjp/dom-selector ${summary.versions.competitor} source`,
        'Selected to investigate gaps and extensions. These percentages are not whole-standard compliance scores.',
        'Includes rejected syntax, XML, shadow contexts, and state changes. Rendering is outside this comparison.',
      ],
    ),
  )
  writeFileSync(
    path.join(directory, 'wpt-compliance.svg'),
    complianceChart(
      'Selected WPT inputs and local regressions',
      'nwsapi results · Selector parsing and DOM matching · Known failures remain failures',
      [
        {
          name: 'Upstream WPT inputs',
          passed: summary.upstream.passed,
          total: summary.upstream.total,
        },
        {
          name: 'Local regressions',
          passed: summary.local.passed,
          total: summary.local.total,
        },
      ],
      [
        `${summary.upstream.pages} upstream pages · ${summary.local.pages} local pages · ${summary.upstream.knownFailures + summary.local.knownFailures} known failures · Chrome ${summary.browser}`,
        'Adapted pages retain selector inputs and exclude rendering checks. This is a selected suite, not all WPT.',
        'No comparison-library WPT result is measured here. Native discovery requirements are a separate pool.',
      ],
    ),
  )
  const count = (value: number) => value.toLocaleString('en-US')
  const text = `<!-- compliance-summary:start -->\n\n![Selector parsing and matching against Chrome](../../../assets/repo/bench/selector-compliance.svg)\n\nIn ${count(summary.native.total)} targeted selector and context cases, \`nwsapi\` agrees with Chrome on **${count(summary.native.nwsapi)}**, compared with **${count(summary.native.competitor)}** for the local source of \`@asamuzakjp/dom-selector\` ${summary.versions.competitor}. Agreement means the same ordered results or the same error type. These cases investigate suspected gaps and extensions. They do not represent all CSS selectors.\n\n| Outcome against Chrome | Cases |\n| --- | ---: |\n| Both libraries agree | ${summary.native.both} |\n| Only \`nwsapi\` agrees | ${summary.native.onlyNwsapi} |\n| Only \`@asamuzakjp/dom-selector\` agrees | ${summary.native.onlyCompetitor} |\n| Neither library agrees | ${summary.native.neither} |\n\n![Selected WPT inputs and local regressions](../../../assets/repo/bench/wpt-compliance.svg)\n\nThe executed suite passes **${count(summary.upstream.passed)} of ${count(summary.upstream.total)} upstream WPT subtests** across ${summary.upstream.pages} pages, plus **${summary.local.passed} of ${summary.local.total} local regression cases** across ${summary.local.pages} pages. Its ${summary.upstream.knownFailures + summary.local.knownFailures} known failures remain visible. Adaptations remove rendering checks while preserving selector inputs. This suite measures \`nwsapi\` only. It does not establish a WPT result for \`@asamuzakjp/dom-selector\`.\n\nThe reports use Chrome **${summary.browser}** and WPT revision \`${summary.wptRevision.slice(0, 12)}\`. The [browser report](../../../assets/repo/bench/selector-compatibility.json), [page-level WPT report](../../../assets/repo/bench/wpt-summary.json), and [chart data](../../../assets/repo/bench/compliance-summary.json) retain the evidence.\n\n<!-- compliance-summary:end -->`
  const document = path.join(REPO_ROOT, 'docs/repo/selector/compatibility.md')
  const before = readFileSync(document, 'utf8')
  const start = before.indexOf('<!-- compliance-summary:start -->')
  const end = before.indexOf('<!-- compliance-summary:end -->')
  if (start < 0 || end < start) {
    throw new Error('Missing compliance summary markers.')
  }
  writeFileSync(
    document,
    before.slice(0, start) +
      text +
      before.slice(end + '<!-- compliance-summary:end -->'.length),
  )
  refreshChartReferences()
}

if (isMainModule(import.meta.url)) {
  writeComplianceCharts()
}
