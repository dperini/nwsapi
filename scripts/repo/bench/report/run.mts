import { browserLaunchOptions } from '../../browser.mts'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { DOCUMENTS, components } from '../documents.mts'
import { cases } from '../cases.mts'
import { writeBenchmarkCharts } from '../chart-report.mts'
import { nativePage, nativeSources } from '../native/host.mts'
import { nativeTiming } from '../native/timing.mts'
import { positiveInteger, provenance, sha256 } from '../footprint/shared.mts'
import { REPO_ROOT } from '../../lib/paths.mts'

const { values } = parseArgs({
  options: {
    output: { type: 'string', default: 'assets/repo/bench' },
    rounds: { type: 'string', default: '9' },
    iterations: { type: 'string', default: '1000' },
    'min-round-ms': { type: 'string', default: '50' },
    'cold-count': { type: 'string', default: '8' },
    help: { type: 'boolean' },
  },
})
if (values.help) {
  console.log(
    'Usage: pnpm run bench [--rounds 9] [--iterations 1000] [--min-round-ms 50] [--cold-count 8] [--output directory]',
  )
} else {
  const rounds = positiveInteger(values.rounds, 'rounds', 100)
  const iterations = positiveInteger(values.iterations, 'iterations', 1_000_000)
  const minRoundMs = positiveInteger(
    values['min-round-ms'],
    'min-round-ms',
    10_000,
  )
  const coldCount = positiveInteger(values['cold-count'], 'cold-count', 100)
  const sources = await nativeSources()
  const browser = await chromium.launch(browserLaunchOptions())
  const output = path.resolve(REPO_ROOT, values.output)
  const { jsdom: _jsdom, ...sourceMetadata } = provenance()
  const metadata = {
    ...sourceMetadata,
    runtime: `Chromium ${browser.version()}`,
    host: 'native browser DOM; no jsdom',
    competitorBundleSha256: sources.competitorBundleSha256,
    rounds,
    iterations,
    minRoundMs,
    coldCount,
    timingEngine:
      'performance.now in a cross-origin-isolated browser; timed batches, rotating engine order; setup excluded',
    engines: [
      { name: `nwsapi ${sourceMetadata.candidateVersion}` },
      { name: `@asamuzakjp/dom-selector ${sourceMetadata.competitorVersion}` },
    ],
  }
  try {
    for (const [fixture, categories] of Object.entries(cases)) {
      const html = DOCUMENTS[fixture as keyof typeof DOCUMENTS].html()
      const page = await nativePage(browser, sources)
      try {
        const result = await nativeTiming(page, {
          html,
          selectors: Object.entries(categories).flatMap(
            ([category, selectors]) =>
              selectors.map(selector => ({ category, selector })),
          ),
          rounds,
          iterations,
          minRoundMs,
          first: false,
          coldCount,
        })
        const directory = path.join(
          output,
          fixture === 'components' ? '' : fixture,
        )
        mkdirSync(directory, { recursive: true })
        const fixtureMetadata = {
          ...metadata,
          fixture,
          fixtureSha256: sha256(html),
          consumed: result.consumed,
        }
        writeFileSync(
          path.join(directory, 'results.json'),
          JSON.stringify(
            { metadata: fixtureMetadata, rows: result.rows },
            null,
            2,
          ) + '\n',
        )
        writeBenchmarkCharts(directory, fixtureMetadata, result.rows)
        console.log(
          `${fixture}: measured ${result.rows.length} direct library comparisons`,
        )
        if (result.rows.some(row => row.errors.some(Boolean))) {
          throw new Error(
            `Incorrect or unsupported query in ${fixture}; inspect results.json.`,
          )
        }
      } finally {
        await page.close()
      }
    }
    const selectors = JSON.parse(
      readFileSync(
        path.join(REPO_ROOT, 'assets/repo/bench/first-query-states.json'),
        'utf8',
      ),
    ).rows.map((row: { selector: string }) => ({
      category: 'first',
      selector: row.selector,
    }))
    const page = await nativePage(browser, sources)
    try {
      const html = components()
      const result = await nativeTiming(page, {
        html,
        selectors,
        rounds,
        iterations,
        minRoundMs,
        first: true,
        coldCount,
      })
      if (result.rows.some(row => row.errors.some(Boolean))) {
        throw new Error('First-match comparison returned incorrect results.')
      }
      const rows = result.rows.map(row => ({
        selector: row.selector,
        warm: row.milliseconds,
        cold: row.cold,
        warmSamples: row.samples,
        coldSamples: row.coldSamples,
        sampleIterations: row.sampleIterations,
      }))
      writeFileSync(
        path.join(output, 'first-query-states.json'),
        JSON.stringify(
          {
            metadata: {
              ...metadata,
              fixtureSha256: sha256(html),
              competitor: sourceMetadata.competitorVersion,
            },
            rows,
          },
          null,
          2,
        ) + '\n',
      )
      console.log(
        `First matches: measured ${rows.length} cold and warm comparisons`,
      )
    } finally {
      await page.close()
    }
  } finally {
    await browser.close()
  }
}
