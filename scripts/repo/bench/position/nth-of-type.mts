import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { chromium } from '@playwright/test'
import { compareTiming } from '../compare/timing.mts'
import { median, sha256 } from '../footprint/shared.mts'
import { checkedPower } from '../planner/has/power.mts'
import { isMainModule } from '../../lib/run-node.mts'

export interface Case {
  id: string
  selector: string
  html: string
}
const sizes = [0, 1, 8, 9, 32, 256, 500, 2000, 5000]
const types = ['i', 'b', 'span', 'em']

export function fixtures(reverse = false): Case[] {
  const entries: Case[] = []
  for (const size of sizes) {
    for (const selector of [':nth-of-type(2)', ':nth-last-of-type(2)']) {
      entries.push({
        id: `homogeneous-${size}-${selector.startsWith(':nth-last') ? 'last' : 'first'}`,
        selector: `i${selector}`,
        html: `<main>${'<i></i>'.repeat(size)}</main>`,
      })
    }
  }
  for (const layout of ['interleaved', 'clustered']) {
    const markup =
      layout === 'interleaved'
        ? Array.from(
            { length: 500 },
            (_, index) =>
              `<${types[index % types.length]}></${types[index % types.length]}>`,
          ).join('')
        : types
            .map(tag => `<section>${`<${tag}></${tag}>`.repeat(125)}</section>`)
            .join('')
    entries.push({
      id: `mixed-${layout}`,
      selector: 'i:nth-of-type(2)',
      html: `<main>${markup}</main>`,
    })
  }
  entries.push({
    id: 'many-parents',
    selector: 'i:nth-of-type(2)',
    html: `<main>${'<section><i></i><b></b><i></i></section>'.repeat(500)}</main>`,
  })
  entries.push({
    id: 'sparse-selected',
    selector: '.selected:nth-of-type(2)',
    html: `<main>${Array.from({ length: 2000 }, (_, index) => `<i${index % 20 === 1 ? ' class="selected"' : ''}></i>`).join('')}</main>`,
  })
  return reverse ? entries.toReversed() : entries
}

export function parseArgs(args: string[]) {
  const options = new Map<string, string>()
  let repeat = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (arg === '--repeat') {
      repeat = true
      continue
    }
    if (
      !['--baseline', '--candidate', '--out'].includes(arg) ||
      !args[index + 1] ||
      args[index + 1]!.startsWith('--')
    ) {
      throw new Error(
        'Usage: nth-of-type.mts --baseline bundle.cjs --candidate bundle.cjs --out directory [--repeat]',
      )
    }
    options.set(arg, args[++index]!)
  }
  const baseline = options.get('--baseline')
  const candidate = options.get('--candidate')
  const out = options.get('--out')
  if (!baseline || !candidate || !out) {
    throw new Error('Baseline, candidate, and output directory are required.')
  }
  return {
    baseline: path.resolve(baseline),
    candidate: path.resolve(candidate),
    out: path.resolve(out),
    repeat,
  }
}

const require = createRequire(import.meta.url)
if (isMainModule(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2))
  if (existsSync(options.out)) {
    throw new Error(`Refusing to overwrite ${options.out}`)
  }
  const sources = [options.baseline, options.candidate].map(file =>
    readFileSync(file, 'utf8'),
  )
  const entries = fixtures(options.repeat)
  const power = checkedPower()
  mkdirSync(options.out, { recursive: true })
  const fixtureText = JSON.stringify(entries)
  const { gzipSync } = await import('node:zlib')
  writeFileSync(
    path.join(options.out, 'fixtures.json.gz'),
    gzipSync(fixtureText),
  )
  for (const [index, source] of sources.entries()) {
    writeFileSync(
      path.join(options.out, `bundle-${index}.cjs.gz`),
      gzipSync(source),
    )
  }
  const rounds: unknown[] = []
  const browser = await chromium.launch()
  const chromiumVersion = browser.version()
  try {
    for (const host of ['chromium', 'jsdom']) {
      for (const entry of entries) {
        const output =
          host === 'jsdom'
            ? await measureJsdom(entry, sources)
            : await measureChromium(browser, entry, sources)
        rounds.push({ host, id: entry.id, ...output })
      }
    }
  } finally {
    await browser.close()
  }
  writeFileSync(
    path.join(options.out, 'rounds.json'),
    JSON.stringify(rounds, null, 2) + '\n',
  )
  writeFileSync(
    path.join(options.out, 'metadata.json'),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        node: process.version,
        platform: `${process.platform}/${process.arch}`,
        cpu: os.cpus()[0]?.model,
        jsdom: require('jsdom/package.json').version,
        playwright: require('@playwright/test/package.json').version,
        chromium: chromiumVersion,
        baselineSha256: sha256(sources[0]!),
        candidateSha256: sha256(sources[1]!),
        fixtureSha256: sha256(fixtureText),
        lockfileSha256: sha256(readFileSync('pnpm-lock.yaml')),
        power,
        powerAfter: checkedPower(),
        repeat: options.repeat,
      },
      null,
      2,
    ) + '\n',
  )
}

async function measureJsdom(entry: Case, sources: string[]) {
  const factories = sources.map(source => {
    const module = { exports: {} }
    compileFunction(source, ['module', 'exports', 'require'])(
      module,
      module.exports,
      require,
    )
    return module.exports as (window: unknown) => {
      select(selector: string, root: Document): NodeListOf<Element>
    }
  })
  const instances = factories.map(factory => {
    const { window } = new JSDOM(entry.html)
    const expected = Array.from(
      window.document.querySelectorAll(entry.selector),
    )
    const engine = factory(window)
    const run = () => Array.from(engine.select(entry.selector, window.document))
    return { window, expected, run }
  })
  try {
    for (const instance of instances) {
      assert.deepEqual(instance.run(), instance.expected, entry.id)
    }
    const timing = await compareTiming(
      instances.map(item => item.run),
      { rounds: 7, milliseconds: 12, batch: 16 },
    )
    for (const instance of instances) {
      assert.deepEqual(instance.run(), instance.expected, entry.id)
    }
    return {
      samples: timing.map(value => value.map(round => round.p50Ns)),
      costs: timing.map(value => median(value.map(round => round.p50Ns))),
    }
  } finally {
    for (const instance of instances) {
      instance.window.close()
    }
  }
}

async function measureChromium(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  entry: Case,
  sources: string[],
) {
  const page = await browser.newPage()
  try {
    await page.setContent(entry.html)
    for (const source of sources) {
      await page.addScriptTag({
        content: `(()=>{const module={exports:{}};const exports=module.exports;${source};(globalThis.nthFactories ||= []).push(module.exports)})()`,
      })
    }
    const result = await page.evaluate(
      async ({ selector }) => {
        const factories = (
          globalThis as typeof globalThis & {
            nthFactories: Array<
              (window: unknown) => {
                select(selector: string, root: Document): NodeListOf<Element>
              }
            >
          }
        ).nthFactories
        const expected = Array.from(document.querySelectorAll(selector))
        const timings: number[][] = [[], []]
        for (let round = 0; round < 21; round += 1) {
          for (let turn = 0; turn < 2; turn += 1) {
            const index = (round + turn) % 2
            const engine = factories[index]!(window)
            const start = performance.now()
            let actual: Element[] = []
            for (let call = 0; call < 16; call += 1) {
              actual = Array.from(engine.select(selector, document))
            }
            timings[index]!.push(((performance.now() - start) * 1e6) / 16)
            if (
              actual.length !== expected.length ||
              actual.some((item, itemIndex) => item !== expected[itemIndex])
            ) {
              throw new Error(`Identity mismatch: ${selector}`)
            }
          }
        }
        return timings
      },
      { selector: entry.selector },
    )
    return { samples: result, costs: result.map(values => median(values)) }
  } finally {
    await page.close()
  }
}
