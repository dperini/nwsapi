import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { isMainModule } from '../../lib/run-node.mts'
import { ENGINE_BUILD_PATH } from '../../lib/paths.mts'
import { DOCUMENTS } from '../documents.mts'
import { provenance, sha256 } from '../footprint/shared.mts'
import { checkedPower } from '../planner/has/power.mts'
import { measureBrowser, measureJsdom, settings } from '../planner/measure.mts'
import type { Fixture } from '../planner/fixtures.mts'
import { expandedCases } from './coverage.mts'

export function unionFixtures(): Fixture[] {
  const entries: Fixture[] = []
  for (const [name, categories] of Object.entries(expandedCases)) {
    const html = DOCUMENTS[name as keyof typeof DOCUMENTS].html()
    for (const [family, selectors] of Object.entries(categories)) {
      for (const selector of selectors) {
        entries.push({
          id: name + '/' + selector,
          family,
          split: 'train',
          html,
          selector,
          tags: [],
        })
      }
    }
  }
  for (const count of [8, 64, 256]) {
    for (const clustered of [false, true]) {
      const names = ['x-a', 'x-b', 'x-c', 'x-d']
      const html =
        '<!doctype html><main>' +
        Array.from({ length: count }, (_, i) => {
          const tag = names[clustered ? Math.floor((i * 4) / count) : i % 4]
          return `<${tag}></${tag}>`
        }).join('') +
        '</main>'
      for (const selector of [
        ':is(x-a, x-b)',
        'main > :where(x-c, x-d)',
        'main > :nth-of-type(2n)',
      ]) {
        entries.push({
          id: `mixed-${count}-${clustered}/${selector}`,
          family: 'mixed sibling controls',
          split: 'holdout',
          html,
          selector,
          tags: names,
        })
      }
    }
  }
  return entries
}

function replaceOnce(source: string, original: string, replacement: string) {
  if (source.split(original).length !== 2) {
    throw new Error('Expected one collection-copy site in the built bundle.')
  }
  return source.replace(original, replacement)
}

export async function measureUnion(
  baselineFile: string,
  output: string,
  repeat: boolean,
) {
  if (existsSync(output)) {
    throw new Error('Use a new union output directory.')
  }
  const baseline = gunzipSync(readFileSync(baselineFile)).toString()
  const candidate = readFileSync(ENGINE_BUILD_PATH, 'utf8')
  const original = 'list = engine.sliceCall(collections[i])'
  const cached = 'list = engine.collectionCopy(collections[i], context)'
  const sources = [
    baseline,
    replaceOnce(baseline, original, cached),
    replaceOnce(candidate, cached, original),
    candidate,
  ]
  const labels = ['baseline', 'collection-copy', 'literal-checks', 'combined']
  const entries = unionFixtures()
  if (repeat) {
    entries.reverse()
  }
  settings.rounds = repeat ? 9 : 7
  settings.milliseconds = repeat ? 24 : 15
  const metadata = {
    ...provenance(),
    labels,
    repeat,
    settings,
    purpose: 'development',
    variants: sources.map(sha256),
    fixturesSha256: sha256(JSON.stringify(entries)),
  }
  mkdirSync(output, { recursive: true })
  writeFileSync(
    path.join(output, 'fixtures.json.gz'),
    gzipSync(JSON.stringify(entries)),
  )
  for (const [i, source] of sources.entries()) {
    writeFileSync(path.join(output, `${labels[i]}.cjs.gz`), gzipSync(source))
  }
  for (const host of ['chromium', 'jsdom']) {
    const powerBefore = checkedPower()
    const startedAt = new Date().toISOString()
    const result =
      host === 'chromium'
        ? await measureBrowser(entries, sources)
        : {
            version: provenance().jsdom,
            rows: await measureJsdom(entries, sources),
          }
    writeFileSync(
      path.join(output, `${host}.json`),
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
  const [baseline, output, pass] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: survey/union.mts baseline.cjs.gz new-output-directory [repeat]',
    )
  } else if (!baseline || !output || (pass && pass !== 'repeat')) {
    throw new Error('Expected baseline archive, output, and optional repeat.')
  } else {
    await measureUnion(baseline, output, pass === 'repeat')
  }
}
