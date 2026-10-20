import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { browserLaunchOptions } from '../../browser.mts'
import { cases } from '../cases.mts'
import { DOCUMENTS } from '../documents.mts'
import { nativePage, nativeSources } from '../native/host.mts'
import { nativeTiming } from '../native/timing.mts'
import { positiveInteger, provenance, sha256 } from '../footprint/shared.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import { checkedPower } from '../planner/has/power.mts'
import { expandedCases, expandedScopedCases } from './coverage.mts'

const { values } = parseArgs({
  options: {
    dependencies: { type: 'string' },
    output: {
      type: 'string',
    },
    rounds: { type: 'string', default: '9' },
    power: { type: 'string', default: 'not recorded' },
    expanded: { type: 'boolean', default: false },
    help: { type: 'boolean' },
  },
})
if (values.help) {
  console.log(
    'Usage: survey/run.mts [--dependencies installation-directory] [--output results.json] [--rounds 9] [--power battery|AC] [--expanded]\nWithout --output, records a timestamped report under .cache/bench.',
  )
} else {
  await run()
}

export async function run() {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-')
  const output = path.resolve(
    REPO_ROOT,
    values.output ?? `.cache/bench/selector-survey-${timestamp}.json`,
  )
  if (existsSync(output)) {
    throw new Error('Use a new survey output path to preserve measurements.')
  }
  const powerBefore = checkedPower()
  const load = createRequire(
    path.join(
      values.dependencies ? path.resolve(values.dependencies) : REPO_ROOT,
      'package.json',
    ),
  )
  const entry = load.resolve('@asamuzakjp/dom-selector')
  const competitorVersion = load('@asamuzakjp/dom-selector/package.json')
    .version as string
  const sources = await nativeSources(entry)
  const browser = await chromium.launch(browserLaunchOptions())
  const rounds = positiveInteger(values.rounds, 'rounds', 100)
  const { jsdom: _jsdom, ...base } = provenance()
  const rows = []
  const fixtures = []
  try {
    for (const [fixture, categories] of Object.entries(
      values.expanded ? expandedCases : cases,
    )) {
      const html = DOCUMENTS[fixture as keyof typeof DOCUMENTS].html()
      const page = await nativePage(browser, sources)
      try {
        const selectors: Array<{
          category: string
          selector: string
          root?: string
        }> = Object.entries(categories).flatMap(([category, names]) =>
          names.map(selector => ({ category, selector })),
        )
        if (values.expanded) {
          const scoped =
            expandedScopedCases[fixture as keyof typeof expandedScopedCases]
          if (scoped) {
            for (const [category, entries] of Object.entries(scoped)) {
              selectors.push(
                ...entries.map(scopedCase => ({ category, ...scopedCase })),
              )
            }
          }
        }
        const result = await nativeTiming(page, {
          html,
          selectors,
          rounds,
          iterations: 16,
          minRoundMs: 30,
          first: false,
          coldCount: 1,
        })
        rows.push(...result.rows.map(row => ({ ...row, fixture })))
        fixtures.push({
          name: fixture,
          sha256: sha256(html),
          consumed: result.consumed,
        })
        console.log(`${fixture}: ${result.rows.length} comparisons recorded`)
      } finally {
        await page.close()
      }
    }
    mkdirSync(path.dirname(output), { recursive: true })
    writeFileSync(
      output,
      JSON.stringify(
        {
          metadata: {
            ...base,
            competitorVersion,
            competitorEntrySha256: sha256(readFileSync(entry)),
            competitorBundleSha256: sources.competitorBundleSha256,
            dependencyLockSha256: values.dependencies
              ? sha256(
                  readFileSync(
                    path.join(values.dependencies, 'package-lock.json'),
                  ),
                )
              : base.lockfileSha256,
            runtime: `Chromium ${browser.version()}`,
            host: 'Native browser DOM, direct library APIs',
            queryState: 'Warm, all results',
            power: values.power,
            powerBefore,
            powerAfter: checkedPower(),
            expanded: values.expanded,
            rounds,
            iterations: 16,
            minRoundMs: 30,
            timingEngine:
              'Alternating engine order, fresh identical document per round, 20ms warmup, timed batches. Native ordered identity checks before and after timing. Setup excluded.',
            engines: [
              { name: `nwsapi ${base.candidateVersion}` },
              { name: `@asamuzakjp/dom-selector ${competitorVersion}` },
            ],
            fixtures,
          },
          rows,
        },
        null,
        2,
      ) + '\n',
    )
    if (rows.some(row => row.errors.some(Boolean))) {
      throw new Error(
        'Incorrect results recorded. Failed rows must not receive timing bars.',
      )
    }
  } finally {
    await browser.close()
  }
}
