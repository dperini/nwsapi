import { browserLaunchOptions } from '../../browser.mts'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import type factory from '../../../../dist/nwsapi.js'

const [baseline, output, layout = 'adjacent', groupsArg = '4'] =
  process.argv.slice(2)
if (!baseline || !output) {
  throw new Error(
    'Usage: result-arrays-browser.mts <baseline.cjs> <output.json> [adjacent|separated|nested] [groups]',
  )
}
if (!['adjacent', 'separated', 'nested'].includes(layout)) {
  throw new Error('Use layout adjacent, separated, or nested')
}
const groups = Number(groupsArg)
if (!Number.isInteger(groups) || groups < 2 || groups > 256) {
  throw new Error('Use a group count from 2 to 256')
}
const paths = [baseline, 'dist/nwsapi.js']
const code = paths.map(p => readFileSync(p, 'utf8'))
type Host = {
  NW: { Dom: ReturnType<typeof factory> }
  before: ReturnType<typeof factory>
}
const browser = await chromium.launch(browserLaunchOptions())
const rows = []
try {
  for (const matches of [0, 1, 16, 256]) {
    const page = await browser.newPage()
    try {
      await page.setContent(
        '<!doctype html><body>' +
          Array.from({ length: 256 }, (_, i) => {
            const element =
              '<p class="' +
              (i < matches ? 'hit g' + (i % groups) : '') +
              '"></p>'
            return layout === 'nested'
              ? '<section>' + element + '</section>'
              : element + (layout === 'separated' ? ' gap <!-- gap -->' : '')
          }).join(''),
      )
      await page.addScriptTag({ content: code[0]! })
      await page.evaluate(() => {
        const host = window as unknown as Host
        host.before = host.NW.Dom
      })
      await page.addScriptTag({ content: code[1]! })
      rows.push(
        ...(await page.evaluate(
          ({ matchCount, groupCount }) => {
            const host = window as unknown as Host
            const engines = [host.before, host.NW.Dom]
            return [
              '.hit',
              Array.from({ length: groupCount }, (_, i) => '.g' + i).join(','),
            ].map(selector => {
              const expected = Array.from(document.querySelectorAll(selector))
              const samples: number[][] = [[], []]
              const query = (index: number) =>
                engines[index]!.select(selector, document)
              const check = (index: number) => {
                const result = query(index)
                if (
                  result.length !== matchCount ||
                  expected.some((node, i) => node !== result[i])
                ) {
                  throw new Error('Incorrect grouped results')
                }
              }
              for (let index = 0; index < 2; ++index) {
                check(index)
                for (let i = 0; i < 1000; ++i) {
                  query(index)
                }
              }
              for (let round = 0; round < 9; ++round) {
                for (let offset = 0; offset < 2; ++offset) {
                  const index = (round + offset) % 2
                  const start = performance.now()
                  let calls = 0
                  do {
                    for (let i = 0; i < 3000; ++i) {
                      query(index)
                    }
                    calls += 3000
                  } while (performance.now() - start < 50)
                  samples[index]!.push((performance.now() - start) / calls)
                  check(index)
                }
              }
              return { matches: matchCount, selector, samplesMs: samples }
            })
          },
          { matchCount: matches, groupCount: groups },
        )),
      )
    } finally {
      await page.close()
    }
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        browser: browser.version(),
        layout,
        groups,
        hashes: code.map(text =>
          createHash('sha256').update(text).digest('hex'),
        ),
        methodology:
          'Native Chromium warm public queries. Each fixture has 256 p elements. The layout field selects adjacent elements, text and comment separators, or a separate section wrapper per element. Queries return 0, 1, 16, or 256 matches. Baseline and candidate rotate across nine rounds of at least 50ms in batches of 3000 calls after 1000 warmups. Ordered identity is checked outside timing. No rendering, compilation, retained-memory or allocation measurements. samplesMs lists baseline then candidate.',
        rows,
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser.close()
}
console.log(`Wrote ${output}`)
