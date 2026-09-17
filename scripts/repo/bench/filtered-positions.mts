import { Session } from 'node:inspector/promises'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'
import { transform } from 'rolldown/utils'
import type { NwsapiEngine } from '../../../.config/runtime.d.ts'
import type { DOMWindow } from 'jsdom'
import { sample, median } from './timing.mts'
import { sha256 } from './footprint/shared.mts'
import { ENGINE_SOURCE_PATH, REPO_ROOT } from '../lib/paths.mts'

const { values } = parseArgs({
  options: {
    baseline: { type: 'string' },
    output: {
      type: 'string',
      default: 'assets/repo/bench/filtered-positions.json',
    },
  },
})
if (!values.baseline) {
  throw new Error(
    'Pass --baseline with the commit before the selector changes.',
  )
}
const before = execFileSync(
  'git',
  ['show', `${values.baseline}:src/nwsapi.mts`],
  { cwd: REPO_ROOT, encoding: 'utf8' },
)
const after = readFileSync(ENGINE_SOURCE_PATH, 'utf8')
async function load(source: string, name: string) {
  const result = await transform('nwsapi.mts', source, {
    lang: 'ts',
    sourceType: 'script',
  })
  if (result.errors.length) {
    throw new Error('Cannot transform benchmark source')
  }
  const module = { exports: {} }
  vm.runInNewContext(
    result.code,
    { module, exports: module.exports },
    { filename: name },
  )
  return module.exports as (window: DOMWindow) => NwsapiEngine
}
const factories = [
  await load(before, 'baseline.js'),
  await load(after, 'candidate.js'),
]
const html =
  '<!doctype html><main>' +
  Array.from(
    { length: 500 },
    (_, i) => `<p id="p${i}"${i % 3 ? ' class="item"' : ''}></p>`,
  ).join('') +
  '</main>'
const { window } = new JSDOM(html)
const doc = window.document
const engines = factories.map(factory => factory(window))
const selectors = [
  'p',
  '.item',
  'main > p',
  'p:nth-child(2n)',
  'p:nth-child(3)',
  'p:nth-of-type(2n)',
]
let consumed = 0
const rows = []
try {
  for (const selector of selectors) {
    const expected = engines[0]!.select(selector, doc)
    const actual = engines[1]!.select(selector, doc)
    if (
      actual.length !== expected.length ||
      Array.from(actual).some((node, i) => node !== expected[i])
    ) {
      throw new Error(`Result mismatch: ${selector}`)
    }
  }
  for (const phase of ['construction', 'select', 'first'] as const) {
    for (const selector of phase === 'construction' ? [''] : selectors) {
      const samples: number[][] = [[], []]
      for (let round = 0; round < 7; round++) {
        for (let offset = 0; offset < 2; offset++) {
          const i = (round + offset) % 2
          const run =
            phase === 'construction'
              ? () => {
                  consumed += factories[i]!(window).Version.length
                }
              : phase === 'select'
                ? () => {
                    consumed += engines[i]!.select(selector, doc).length
                  }
                : () => {
                    consumed += Number(!!engines[i]!.first(selector, doc))
                  }
          const result = await sample(
            run,
            phase === 'construction' ? 50 : 100,
            10,
          )
          samples[i]!.push(result.milliseconds)
        }
      }
      rows.push({
        phase,
        selector,
        beforeMs: median(samples[0]!),
        afterMs: median(samples[1]!),
        samples,
      })
    }
  }
  const filtered = []
  for (const selector of [
    'p:nth-child(2n of .item)',
    'p:nth-last-child(1 of .item)',
    'p:nth-child(2n of :not([hidden]))',
  ]) {
    for (const phase of ['select', 'first'] as const) {
      const result = await sample(
        () => {
          const value = engines[1]![phase](selector, doc)
          consumed +=
            phase === 'select' ? (value as Element[]).length : Number(!!value)
        },
        100,
        20,
      )
      filtered.push({
        phase,
        selector,
        milliseconds: result.milliseconds,
        samples: result.samples,
      })
    }
  }
  const session = new Session()
  const profileRoot = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-filtered-profile-'),
  )
  let profileSummary
  session.connect()
  try {
    await session.post('Profiler.enable')
    await session.post('Profiler.start')
    for (let i = 0; i < 2000; i++) {
      consumed += engines[1]!.select('p:nth-child(2n of .item)', doc).length
    }
    const { profile } = await session.post('Profiler.stop')
    writeFileSync(
      path.join(profileRoot, 'filtered.cpuprofile'),
      JSON.stringify(profile),
    )
    const counts = new Map<number, number>()
    for (const id of profile.samples ?? []) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    profileSummary = {
      samples: profile.samples?.length ?? 0,
      top: profile.nodes
        .map(node => ({
          function: node.callFrame.functionName,
          samples: counts.get(node.id) ?? 0,
        }))
        .toSorted((a, b) => b.samples - a.samples)
        .slice(0, 15),
    }
  } finally {
    session.disconnect()
  }
  const report = {
    recorded: new Date().toISOString(),
    baseline: values.baseline,
    hashes: { before: sha256(before), after: sha256(after) },
    node: process.version,
    v8: process.versions.v8,
    cpu: os.cpus()[0]?.model,
    html,
    rounds: 7,
    rows,
    filtered,
    profile: profileSummary,
    consumed,
  }
  writeFileSync(
    path.resolve(REPO_ROOT, values.output),
    JSON.stringify(report) + '\n',
  )
  console.log(
    JSON.stringify({
      output: values.output,
      profile: path.join(profileRoot, 'filtered.cpuprofile'),
      rows: rows.map(({ samples: _samples, ...row }) => row),
      filtered: filtered.map(({ samples: _samples, ...row }) => row),
    }),
  )
} finally {
  window.close()
}
