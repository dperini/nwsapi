import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import type { Page } from '@playwright/test'
import type { Fixture } from '../fixtures.mts'
import { diagnosticFixtures } from './diagnostic.mts'
import { chromium } from '@playwright/test'
import { isMainModule } from '../../../lib/run-node.mts'
import { REPO_ROOT } from '../../../lib/paths.mts'
import { browserLaunchOptions } from '../../../browser.mts'
import { provenance, sha256 } from '../../footprint/shared.mts'
import { baselinePath } from '../has/variants.mts'
import { crossedFixtures } from './crossed.mts'
import { dispatchBundle } from './variants.mts'
import { splitDispatchBundle } from './specialize.mts'

async function captureFixture(page: Page, fixture: Fixture, calls: number) {
  return page.evaluate(
    ({ entry, iterations }) => {
      const frame = document.createElement('iframe')
      frame.hidden = true
      document.body.append(frame)
      try {
        const doc = frame.contentDocument!
        doc.open()
        doc.write(entry.html)
        doc.close()
        const factory = (
          globalThis as unknown as {
            factory: (window: unknown) => {
              select(selector: string, context: Document): Element[]
            }
          }
        ).factory
        const engine = factory(frame.contentWindow)
        const expected = Array.from(doc.querySelectorAll(entry.selector))
        let count = 0
        for (let index = 0; index < iterations; ++index) {
          count += engine.select(entry.selector, doc).length
        }
        const actual = engine.select(entry.selector, doc)
        if (
          actual.length !== expected.length ||
          actual.some((node, index) => node !== expected[index])
        ) {
          throw new Error('Trace query result mismatch')
        }
        return count
      } finally {
        frame.remove()
      }
    },
    { entry: fixture, iterations: calls },
  )
}

async function capture(modelDirectory: string, mixed: boolean) {
  const baseline = readFileSync(baselinePath(), 'utf8')
  const model = readFileSync(path.join(modelDirectory, 'chromium.mjs'), 'utf8')
  const evaluation = JSON.parse(
    readFileSync(path.join(modelDirectory, 'evaluation.json'), 'utf8'),
  ) as {
    results: { chromium: { modelSha256: string } }
  }
  assert.equal(sha256(model), evaluation.results.chromium.modelSha256)
  const fixture = crossedFixtures().find(
    entry => entry.id === 'crossed-7-192-4-0',
  )!
  const entries = mixed ? [...diagnosticFixtures(), fixture] : [fixture]
  const calls = mixed ? 2000 : 60_000
  const variants = [
    ['baseline', baseline],
    ['model', dispatchBundle(baseline, model, false, true)],
    ['split', splitDispatchBundle(baseline, model)],
  ] as const
  const browser = await chromium.launch({
    ...browserLaunchOptions(),
    args: ['--js-flags=--trace-opt --trace-deopt --trace-turbo-inlining'],
  })
  try {
    for (const [name, code] of variants) {
      const page = await browser.newPage()
      const source = code.replace(
        /\b(selectBulkHasDispatch|selectBulkHas|markAncestors|runSingle|prepareBulkHas)\b/g,
        `$1_${name}`,
      )
      await page.setContent('<!doctype html><body></body>')
      await page.addScriptTag({
        content: `var module={exports:{}};var exports=module.exports;${source};globalThis.factory=module.exports;`,
      })
      console.log(`BEGIN ${name}`)
      for (const entry of entries) {
        const consumed = await captureFixture(page, entry, calls)
        console.log(`${name} ${entry.id} consumed=${consumed}`)
      }
      console.log(`END ${name}`)
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

export function trace(model: string, output: string, mixed = false) {
  assert.ok(!existsSync(output), 'Use a new trace directory')
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      model,
      output,
      mixed ? 'capture-mixed' : 'capture',
    ],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, DEBUG: 'pw:browser' },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60_000,
    },
  )
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  const lines = result.stderr.split('\n')
  const summary = lines.filter(line =>
    /selectBulkHas|markAncestors|runSingle|bailout/.test(line),
  )
  mkdirSync(output, { recursive: true })
  writeFileSync(path.join(output, 'stdout.txt'), result.stdout)
  writeFileSync(path.join(output, 'v8.log.gz'), gzipSync(result.stderr))
  writeFileSync(
    path.join(output, 'matching-summary.txt'),
    summary.join('\n') + '\n',
  )
  writeFileSync(
    path.join(output, 'experiment.json'),
    JSON.stringify(
      {
        ...provenance(),
        model,
        fixture: mixed
          ? '96 fresh cases followed by crossed-7-192-4-0'
          : 'crossed-7-192-4-0',
        callsPerFixture: mixed ? 2000 : 60_000,
        flags: ['--trace-opt', '--trace-deopt', '--trace-turbo-inlining'],
        scope:
          'Three pages with variant-labelled function names and fresh iframes per fixture. JIT diagnostics only. Logging and renaming change execution. Query counts differ from the timing workload.',
        logSha256: sha256(result.stderr),
      },
      null,
      2,
    ) + '\n',
  )
}

if (isMainModule(import.meta.url)) {
  const [model, output, mode] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: dispatch/trace.mts frozen-model new-output-directory [mixed]',
    )
  } else if (!model || !output) {
    throw new Error('Frozen model and a new trace directory required.')
  } else if (mode?.startsWith('capture')) {
    await capture(model, mode === 'capture-mixed')
  } else {
    assert.ok(!mode || mode === 'mixed', 'Unknown trace mode')
    trace(model, output, mode === 'mixed')
  }
}
