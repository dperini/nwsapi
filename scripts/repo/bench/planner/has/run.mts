import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { provenance, sha256 } from '../../footprint/shared.mts'
import {
  assertRoutes,
  measureBrowser,
  measureJsdom,
  settings,
} from '../measure.mts'
import type { Fixture } from '../fixtures.mts'
import { fixtures } from './fixtures.mts'
import { fit } from './fit.mts'
import {
  baselinePath,
  confirmationVariants,
  preflightVariants,
  probeSource,
  variants,
} from './variants.mts'
import type { Fitted } from './variants.mts'

const [phase, output, pass] = process.argv.slice(2)
if (
  !output ||
  !['collect', 'evaluate', 'preflight', 'confirm'].includes(phase!)
) {
  throw new Error(
    'Usage: planner/has/run.mts collect|evaluate|preflight|confirm output-directory [repeat]',
  )
}
if (pass && (phase !== 'confirm' || pass !== 'repeat')) {
  throw new Error('Only confirm accepts the optional repeat pass.')
}
if (pass) {
  settings.rounds = 11
  settings.milliseconds = 24
}
mkdirSync(output, { recursive: true })
const fixtureFile = path.join(output, 'fixtures.json.gz')
const entries: Fixture[] =
  phase === 'collect'
    ? fixtures()
    : (JSON.parse(
        gunzipSync(readFileSync(fixtureFile)).toString(),
      ) as Fixture[])
if (phase === 'collect') {
  writeFileSync(fixtureFile, gzipSync(JSON.stringify(entries)))
}
const metadata = {
  ...provenance(),
  candidateSha256: sha256(readFileSync(baselinePath())),
  scenario: 'has',
  settings,
  pass: pass || 'initial',
  fixtureSha256: sha256(readFileSync(fixtureFile)),
  power:
    process.platform === 'darwin'
      ? execFileSync('/usr/bin/pmset', ['-g', 'batt'], {
          encoding: 'utf8',
        }).trim()
      : 'unknown',
  featureNames: [
    'anchorCount',
    'witnessCount',
    'attributeMask',
    'witnessRatio',
  ],
  routeLabels:
    phase === 'collect'
      ? ['rule', 'forward', 'inverse']
      : [
          'rule',
          phase === 'confirm'
            ? 'guarded implementation'
            : phase === 'preflight'
              ? 'empty-witness preflight'
              : 'trained',
        ],
}
assertRoutes(entries, probeSource())
const previous =
  phase === 'evaluate'
    ? (JSON.parse(
        readFileSync(path.join(output, 'shared-model.json'), 'utf8'),
      ) as Fitted)
    : undefined
if (
  previous &&
  previous.baseline.candidateSha256 !== metadata.candidateSha256
) {
  throw new Error('Recollect labels after changing the runtime build.')
}
const sources =
  phase === 'confirm'
    ? confirmationVariants()
    : phase === 'preflight'
      ? preflightVariants()
      : variants(previous)
let selected =
  phase === 'collect' || phase === 'confirm'
    ? entries
    : entries.filter(entry => entry.split === 'holdout')
if (pass) {
  selected = selected.toReversed()
}
for (const host of ['chromium', 'jsdom']) {
  const result =
    host === 'chromium'
      ? await measureBrowser(selected, sources)
      : { rows: await measureJsdom(selected, sources), version: metadata.jsdom }
  const data = {
    metadata: {
      ...metadata,
      host,
      version: result.version,
      variants: sources.map(sha256),
    },
    rows: result.rows,
  }
  writeFileSync(
    path.join(
      output,
      `${host}-${phase === 'collect' ? 'training' : phase === 'evaluate' ? 'evaluation' : phase === 'confirm' ? 'confirmation' : 'preflight'}${pass ? '-repeat' : ''}.json`,
    ),
    JSON.stringify(data, null, 2) + '\n',
  )
}
if (phase === 'collect') {
  fit(output)
}
