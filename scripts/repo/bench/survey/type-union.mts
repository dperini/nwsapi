import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { gunzipSync, gzipSync } from 'node:zlib'
import { isMainModule } from '../../lib/run-node.mts'
import { DOCUMENTS } from '../documents.mts'
import { positiveInteger, provenance, sha256 } from '../footprint/shared.mts'
import { checkedPower } from '../planner/has/power.mts'
import { measureBrowser, measureJsdom, settings } from '../planner/measure.mts'
import type { Fixture } from '../planner/fixtures.mts'
import { expandedCases } from './coverage.mts'

export function typeUnionFixtures(expanded = false): Fixture[] {
  const entries: Fixture[] = []
  const shapes = {
    empty: '',
    small: '<dl><dd><a></a><code></code></dd></dl>',
    wide: '<dl><dd><a></a><code></code></dd></dl>'.repeat(300),
    narrow:
      '<dl><dd><a></a><code></code></dd></dl>' +
      '<a></a><code></code>'.repeat(300),
    sparse:
      '<dl><dd><a></a><code></code>' + '<i></i>'.repeat(1500) + '</dd></dl>',
    nested:
      '<dl><dd><a></a><dl><dd><code></code></dd></dl><code></code></dd></dl>'.repeat(
        30,
      ),
    absent: '<dl><dd><i></i></dd></dl>'.repeat(300),
    'absent-small': '<dl><dd><i></i></dd></dl>'.repeat(16),
  }
  for (const [shape, html] of Object.entries(shapes)) {
    for (const selector of [
      'dl dd :is(a, code)',
      'dl dd :is(a, a)',
      'dl dd :where(a, code, a, code)',
    ]) {
      entries.push({
        id: `${shape}/${selector}`,
        family: shape,
        split: 'holdout',
        html: '<!doctype html><main>' + html + '</main>',
        selector,
        tags: ['a', 'code'],
      })
    }
  }
  const html = DOCUMENTS.documentation.html()
  for (const selector of [
    'ul li :is(a, code)',
    'dl dd :where(a, code)',
    'dl dd :is(a, a, a, a)',
    'div.example :is(p, pre)',
    'table tr :is(td, th)',
    'a',
    'dl dd a',
  ]) {
    entries.push({
      id: `documentation/${selector}`,
      family: 'documentation',
      split: 'train',
      html,
      selector,
      tags: [],
    })
  }
  if (expanded) {
    const ids = new Set(entries.map(entry => entry.id))
    for (const [name, groups] of Object.entries(expandedCases)) {
      const fixtureHtml = DOCUMENTS[name as keyof typeof DOCUMENTS].html()
      for (const selector of Object.values(groups).flat()) {
        const id = `${name}/${selector}`
        if (!ids.has(id)) {
          ids.add(id)
          entries.push({
            id,
            family: name,
            split: 'holdout',
            html: fixtureHtml,
            selector,
            tags: [],
          })
        }
      }
    }
  }
  return entries
}

export function parseOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      baseline: { type: 'string' },
      candidate: { type: 'string' },
      output: { type: 'string' },
      repeat: { type: 'boolean', default: false },
      expanded: { type: 'boolean', default: false },
      rounds: { type: 'string', default: '9' },
    },
  })
  if (!values.baseline || !values.candidate || !values.output) {
    throw new Error(
      'Pass --baseline <bundle> --candidate <bundle> --output <new-directory> [--repeat] [--expanded] [--rounds 9].',
    )
  }
  return {
    baseline: path.resolve(values.baseline),
    candidate: path.resolve(values.candidate),
    output: path.resolve(values.output),
    repeat: values.repeat,
    expanded: values.expanded,
    rounds: positiveInteger(values.rounds, 'rounds', 100),
  }
}

export function readBundle(file: string) {
  const bytes = readFileSync(file)
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8')
}

export async function measureTypeUnions(
  options: ReturnType<typeof parseOptions>,
) {
  if (existsSync(options.output)) {
    throw new Error('Use a new type-union output directory.')
  }
  checkedPower()
  const labels = ['baseline', 'candidate']
  const sources = [readBundle(options.baseline), readBundle(options.candidate)]
  const entries = typeUnionFixtures(options.expanded)
  if (options.repeat) {
    entries.reverse()
    labels.reverse()
    sources.reverse()
  }
  Object.assign(settings, {
    rounds: options.rounds,
    milliseconds: 24,
    batch: 16,
  })
  mkdirSync(options.output, { recursive: true })
  const fixtures = JSON.stringify(entries)
  writeFileSync(
    path.join(options.output, 'fixtures.json.gz'),
    gzipSync(fixtures),
  )
  for (const [index, source] of sources.entries()) {
    writeFileSync(
      path.join(options.output, `${labels[index]}.cjs.gz`),
      gzipSync(source),
    )
  }
  const metadata = {
    ...provenance(),
    labels,
    variants: sources.map(sha256),
    fixturesSha256: sha256(fixtures),
    repeat: options.repeat,
    expanded: options.expanded,
    settings: { ...settings },
    queryState:
      'Warm complete select() queries, ordered identity checked against the host before and after timing.',
  }
  for (const host of ['chromium', 'jsdom']) {
    const powerBefore = checkedPower()
    const startedAt = new Date().toISOString()
    const result =
      host === 'chromium'
        ? await measureBrowser(entries, sources)
        : {
            version: metadata.jsdom,
            rows: await measureJsdom(entries, sources),
          }
    writeFileSync(
      path.join(options.output, `${host}.json`),
      JSON.stringify(
        {
          metadata: {
            ...metadata,
            host,
            version: result.version,
            powerBefore,
            powerAfter: checkedPower(),
            startedAt,
            finishedAt: new Date().toISOString(),
          },
          rows: result.rows,
        },
        null,
        2,
      ) + '\n',
    )
  }
}

if (isMainModule(import.meta.url)) {
  await measureTypeUnions(parseOptions(process.argv.slice(2)))
}
