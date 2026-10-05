import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { isMainModule } from '../../../lib/run-node.mts'
import { provenance, sha256 } from '../../footprint/shared.mts'
import { fixtures } from '../has/fixtures.mts'
import { baselinePath } from '../has/variants.mts'
import { checkedPower } from '../has/power.mts'
import { measureBrowser, measureJsdom, settings } from '../measure.mts'
import { adaptiveNames, adaptiveVariants } from './variants.mts'
import { nativeObservations, nodeObservations } from './evidence.mts'

export async function collectAdaptive(output: string, prefix: number) {
  if (existsSync(output)) {
    throw new Error('Adaptive collection needs a new directory: ' + output)
  }
  if (![2, 4, 8].includes(prefix)) {
    throw new Error('Prefix must be 2, 4, or 8.')
  }
  mkdirSync(output, { recursive: true })
  settings.rounds = 11
  settings.milliseconds = 20
  const entries = fixtures()
  const sources = adaptiveVariants(prefix)
  const metadata = {
    format: 1,
    scenario: 'adaptive-has',
    purpose: 'development',
    ...provenance(),
    prefix,
    settings,
    labels: adaptiveNames,
    candidateSha256: sha256(readFileSync(baselinePath())),
    variants: sources.map(sha256),
    power: checkedPower(),
    features: [
      'anchors',
      'processed',
      'passed',
      'hits',
      'candidates',
      'denseInverse',
    ],
    gate: { geometricSpeedRatio: 1.05, worstTimeRatio: 1.15 },
    split: entries.map(entry => ({
      id: entry.id,
      group: entry.family,
      split: entry.split,
    })),
    note: 'Known fixture families used for development. No final holdout claim.',
  }
  writeFileSync(
    path.join(output, 'experiment.json'),
    JSON.stringify(metadata, null, 2) + '\n',
  )
  writeFileSync(
    path.join(output, 'fixtures.json.gz'),
    gzipSync(JSON.stringify(entries)),
  )
  for (const [index, source] of sources.entries()) {
    writeFileSync(
      path.join(output, `${adaptiveNames[index]}.cjs.gz`),
      gzipSync(source),
    )
  }
  let previous: unknown
  for (const host of ['chromium', 'jsdom']) {
    const power = checkedPower()
    const startedAt = new Date().toISOString()
    console.log(`${host}: adaptive prefix ${prefix}, ${entries.length} cases`)
    const observations =
      host === 'chromium'
        ? await nativeObservations(entries, prefix)
        : nodeObservations(entries, prefix)
    if (previous && JSON.stringify(previous) !== JSON.stringify(observations)) {
      throw new Error('Hosts observed different adaptive prefix features.')
    }
    previous = observations
    const result =
      host === 'chromium'
        ? await measureBrowser(entries, sources)
        : {
            version: metadata.jsdom,
            rows: await measureJsdom(entries, sources),
          }
    writeFileSync(
      path.join(output, `${host}-training.json`),
      JSON.stringify(
        {
          metadata: {
            ...metadata,
            host,
            version: result.version,
            power,
            powerAfter: checkedPower(),
            startedAt,
            finishedAt: new Date().toISOString(),
          },
          rows: result.rows.map((row, i) => ({
            ...row,
            observations: observations[i]!.features,
          })),
        },
        null,
        2,
      ) + '\n',
    )
  }
}

if (isMainModule(import.meta.url)) {
  const [output, prefix = '4'] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log('Usage: adaptive/collect.mts new-output-directory [2|4|8]')
  } else if (!output) {
    throw new Error('Output directory required.')
  } else {
    await collectAdaptive(output, Number(prefix))
  }
}
