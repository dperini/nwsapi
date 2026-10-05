import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { isMainModule } from '../../../lib/run-node.mts'
import { browserLaunchOptions } from '../../../browser.mts'
import { compareTiming } from '../../compare/timing.mts'
import { median } from '../../footprint/shared.mts'
import { checkedPower } from '../has/power.mts'
import type { ScalarModel, Input } from './parity.mts'

const names = ['baseline', 'reference', 'scalar', 'folded']
const baselineSource = `export function chooseRoute(a, w, attrs, dense, host) {
  return w <= a * 2 || (dense && a <= 192 && w <= a * 4);
}`

function inputs(): Input[] {
  return Array.from({ length: 256 }, (_, i) => [
    32 + ((i * 43) % 700),
    1 + ((i * 67) % 2300),
    i % 3 ? 0 : 3,
    i % 3 !== 0,
    'chromium',
  ])
}

async function nodeOverhead(sources: string[], values: Input[]) {
  const modules = await Promise.all(
    sources.map(
      source =>
        import(
          'data:text/javascript;base64,' +
            Buffer.from(source).toString('base64')
        ) as Promise<ScalarModel>,
    ),
  )
  let cursor = 0
  const calls = modules.map(module => () => {
    const item = values[cursor++ % values.length]!
    return module.chooseRoute(item[0], item[1], item[2], item[3], item[4])
  })
  const result = await compareTiming(calls, {
    rounds: 11,
    milliseconds: 20,
    batch: 64,
  })
  return Object.fromEntries(
    result.map((rounds, i) => [
      names[i],
      {
        medianNs: median(rounds.map(round => round.p50Ns)),
        rounds: rounds.map(round => round.p50Ns),
      },
    ]),
  )
}

async function browserOverhead(sources: string[], values: Input[]) {
  const browser = await chromium.launch(browserLaunchOptions())
  try {
    const page = await browser.newPage()
    await page.route('https://overhead.test/**', route =>
      route.fulfill({
        body: '<!doctype html><body>',
        contentType: 'text/html',
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        },
      }),
    )
    await page.goto('https://overhead.test/')
    const samples = await page.evaluate(
      async ({ sources: moduleSources, values: cases }) => {
        if (!crossOriginIsolated) {
          throw new Error('Expected isolated timing context')
        }
        const modules: ScalarModel[] = await Promise.all(
          moduleSources.map(
            source => import('data:text/javascript;base64,' + btoa(source)),
          ),
        )
        const result: number[][] = modules.map(() => [])
        let cursor = 0
        let checksum = 0
        const call = (index: number) => {
          const input = cases[cursor++ % cases.length]!
          checksum += Number(
            modules[index]!.chooseRoute(
              input[0],
              input[1],
              input[2],
              input[3],
              input[4],
            ),
          )
        }
        for (let i = 0; i < 10_000; ++i) {
          for (let j = 0; j < modules.length; ++j) {
            call(j)
          }
        }
        for (let round = 0; round < 11; ++round) {
          for (let turn = 0; turn < modules.length; ++turn) {
            const index = (turn + round) % modules.length
            const start = performance.now()
            let count = 0
            do {
              for (let i = 0; i < 64; ++i) {
                call(index)
              }
              count += 64
            } while (performance.now() - start < 20)
            result[index]!.push(((performance.now() - start) * 1e6) / count)
          }
        }
        return { result, checksum }
      },
      { sources, values },
    )
    return {
      version: browser.version(),
      checksum: samples.checksum,
      results: Object.fromEntries(
        samples.result.map((rounds, i) => [
          names[i],
          { medianNs: median(rounds), rounds },
        ]),
      ),
    }
  } finally {
    await browser.close()
  }
}

export async function measureOverhead(directory: string) {
  const sources = [
    baselineSource,
    ...names
      .slice(1)
      .map(name => readFileSync(path.join(directory, `${name}.mjs`), 'utf8')),
  ]
  const power = checkedPower()
  const values = inputs()
  const node = await nodeOverhead(sources, values)
  const browser = await browserOverhead(sources, values)
  const result = {
    nodeVersion: process.version,
    power,
    powerAfter: checkedPower(),
    inputs: values.length,
    node,
    browser,
    scope: 'Rotating mixed inputs; decision overhead only, no DOM operations.',
  }
  writeFileSync(
    path.join(directory, 'overhead.json'),
    JSON.stringify(result, null, 2) + '\n',
  )
  return result
}

if (isMainModule(import.meta.url)) {
  const [directory] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log('Usage: neural/overhead.mts scalar-export-directory')
  } else if (!directory) {
    throw new Error('Scalar export directory required.')
  } else {
    console.log(await measureOverhead(directory))
  }
}
