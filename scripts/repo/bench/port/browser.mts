import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { chromium } from '@playwright/test'
import { browserLaunchOptions } from '../../browser.mts'
import { cases } from './cases.mts'

const [baseline, candidate, output] = process.argv.slice(2)
assert.ok(
  baseline && candidate && output,
  'Usage: browser.mts baseline.cjs candidate.cjs output.json',
)
const files = [baseline, candidate]
const sources = files.map(file => readFileSync(file, 'utf8'))
const browser = await chromium.launch({
  ...browserLaunchOptions(),
  headless: true,
})
try {
  const page = await browser.newPage()
  await page.setContent('<!doctype html><main></main>')
  for (let i = 0; i < sources.length; ++i) {
    await page.addScriptTag({ content: sources[i]! })
    await page.evaluate(index => {
      Reflect.set(window, 'portEngine' + index, window.NW.Dom)
    }, i)
  }
  const measurements = await page.evaluate(entries => {
    const engines = [
      Reflect.get(window, 'portEngine0'),
      Reflect.get(window, 'portEngine1'),
    ] as Array<typeof window.NW.Dom>
    const rows = []
    for (const entry of entries) {
      document.body.innerHTML = entry.markup.replace('<!doctype html>', '')
      const element =
        document.querySelector(entry.target || '.leaf') ||
        document.querySelector('section')!
      const expected = entry.match
        ? element.matches(entry.selector)
        : Array.from(document.querySelectorAll(entry.selector))
      const queries = engines.map(engine =>
        entry.match
          ? () => engine.match(entry.selector, element)
          : () => engine.select(entry.selector, document),
      )
      const check = () => {
        for (const query of queries) {
          const actual = query()
          const correct = Array.isArray(expected)
            ? typeof actual !== 'boolean' &&
              actual.length === expected.length &&
              Array.from(actual).every((node, i) => node === expected[i])
            : actual === expected
          if (!correct) {
            throw new Error('Incorrect benchmark: ' + entry.name)
          }
        }
      }
      check()
      for (const query of queries) {
        for (let i = 0; i < 64; ++i) {
          query()
        }
      }
      const samples: number[][] = [[], []]
      for (let round = 0; round < 7; ++round) {
        for (let turn = 0; turn < 2; ++turn) {
          const index = (round + turn) % 2
          const start = performance.now()
          let calls = 0
          let elapsed = 0
          do {
            let result
            for (let i = 0; i < 8; ++i) {
              result = queries[index]!()
            }
            Reflect.set(window, 'portSink', result)
            calls += 8
            elapsed = performance.now() - start
          } while (elapsed < 25)
          samples[index]!.push(elapsed / calls)
        }
      }
      check()
      const milliseconds = samples.map(
        values => values.toSorted((a, b) => a - b)[3]!,
      )
      rows.push({
        ...entry,
        samples,
        milliseconds,
        speedup: milliseconds[0]! / milliseconds[1]!,
      })
    }
    return rows
  }, cases)
  for (const row of measurements) {
    console.log(row.name + ': ' + row.speedup.toFixed(2) + 'x')
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        browser: browser.version(),
        files: files.map((file, i) => ({
          file,
          sha256: createHash('sha256').update(sources[i]!).digest('hex'),
        })),
        settings: { rounds: 7, milliseconds: 25, batch: 8 },
        rows: measurements,
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser.close()
}
