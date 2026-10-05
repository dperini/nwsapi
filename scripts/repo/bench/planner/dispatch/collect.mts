import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { setImmediate } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { isMainModule } from '../../../lib/run-node.mts'
import { provenance, sha256 } from '../../footprint/shared.mts'
import { measureBrowser, measureJsdom, settings } from '../measure.mts'
import { browserEvidence, jsdomEvidence } from '../has/evidence.mts'
import {
  baselinePath,
  instrumentedVariants,
  variants,
} from '../has/variants.mts'
import { checkedPower } from '../has/power.mts'
import { exportDataset } from '../neural/export.mts'
import { fixtures, split } from './fixtures.mts'
import { crossedFixtures } from './crossed.mts'
import { expandedFixtures } from './expanded.mts'

async function nodeEvidence(entries: ReturnType<typeof fixtures>) {
  const evidence = []
  const sources = instrumentedVariants()
  for (let index = 0; index < entries.length; index += 8) {
    evidence.push(...jsdomEvidence(entries.slice(index, index + 8), sources))
    await setImmediate()
  }
  return evidence
}

function collectionFixtures(expanded: boolean, crossed: boolean) {
  if (crossed) {
    return crossedFixtures()
  }
  return expanded ? expandedFixtures() : fixtures()
}

function collectionScope(expanded: boolean, crossed: boolean) {
  if (crossed) {
    return 'Every filter combination in each fresh layout, including 32 anchors. Whole layouts define training, validation and evaluation splits. Older fixtures are safety controls.'
  }
  return expanded
    ? 'Expanded synthetic layouts with separate filters and intermediate counts. Previous fixtures are safety controls.'
    : 'New synthetic template evaluation; previous fixtures are development only.'
}

export async function collect(
  output: string,
  resume = false,
  expanded = false,
  crossed = false,
) {
  if (existsSync(output) && !resume) {
    throw new Error('Use a new collection directory.')
  }
  mkdirSync(output, { recursive: true })
  settings.rounds = 11
  settings.milliseconds = 20
  const entries = collectionFixtures(expanded, crossed)
  const sources = variants()
  const packed = gzipSync(JSON.stringify(entries))
  const metadata = {
    ...provenance(),
    format: 2,
    contractVersion: 2,
    scenario: 'has',
    candidateSha256: sha256(readFileSync(baselinePath())),
    fixtureSha256: sha256(packed),
    settings,
    featureNames: [
      'anchorCount',
      'witnessCount',
      'attributeMask',
      'witnessRatio',
    ],
    routeLabels: [
      'baseline',
      'forward-after-preflight',
      'inverse-after-preflight',
    ],
    variants: sources.map(sha256),
  }
  if (resume) {
    const previous = JSON.parse(
      readFileSync(path.join(output, 'experiment.json'), 'utf8'),
    ) as typeof metadata
    for (const field of [
      'candidateSha256',
      'fixtureSha256',
      'variants',
      'settings',
    ] as const) {
      assert.deepEqual(
        previous[field],
        metadata[field],
        'Cannot resume a changed collection',
      )
    }
  }
  writeFileSync(path.join(output, 'fixtures.json.gz'), packed)
  for (const [index, source] of sources.entries()) {
    writeFileSync(path.join(output, `route-${index}.cjs.gz`), gzipSync(source))
  }
  writeFileSync(
    path.join(output, 'experiment.json'),
    JSON.stringify(
      {
        ...metadata,
        scope: collectionScope(expanded, crossed),
        featureStage:
          'After existing witness preflight; no anchor profiling or additional DOM scan.',
        gate: { geometricSpeedRatio: 1.05, worstTimeRatio: 1.15 },
        split: entries.map(entry => ({
          id: entry.id,
          family: entry.family,
          split: split(entry.family),
        })),
      },
      null,
      2,
    ) + '\n',
  )
  for (const host of ['chromium', 'jsdom']) {
    if (resume && existsSync(path.join(output, `${host}-training.json`))) {
      continue
    }
    const power = checkedPower()
    const evidence =
      host === 'chromium'
        ? await browserEvidence(entries, instrumentedVariants())
        : await nodeEvidence(entries)
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
          },
          rows: result.rows.map((row, index) => ({
            ...row,
            routeEvidence: evidence[index],
          })),
        },
        null,
        2,
      ) + '\n',
    )
  }
  exportDataset(output, path.join(output, 'dataset'))
}

if (isMainModule(import.meta.url)) {
  const [output, pass] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: dispatch/collect.mts new-output-directory [resume|expanded|resume-expanded|crossed|resume-crossed]',
    )
  } else if (
    !output ||
    (pass &&
      ![
        'resume',
        'expanded',
        'resume-expanded',
        'crossed',
        'resume-crossed',
      ].includes(pass))
  ) {
    throw new Error('Output directory required.')
  } else {
    await collect(
      output,
      pass?.startsWith('resume'),
      pass?.includes('expanded'),
      pass?.includes('crossed'),
    )
  }
}
