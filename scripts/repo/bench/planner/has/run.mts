import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
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
import { checkedPower } from './power.mts'
import { contractVectors, contractVersion } from './contract.mts'
import { browserEvidence, jsdomEvidence } from './evidence.mts'
import {
  baselinePath,
  confirmationVariants,
  preflightVariants,
  probeSource,
  variants,
  instrumentedVariants,
} from './variants.mts'
import type { Fitted } from './variants.mts'

const [phase, output, pass] = process.argv.slice(2)
const rounds = process.env['NWSAPI_PLANNER_ROUNDS']
const milliseconds = process.env['NWSAPI_PLANNER_MILLISECONDS']
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
  settings.rounds = Math.max(settings.rounds, 11)
  settings.milliseconds = Math.max(settings.milliseconds, 24)
}
if (rounds) {
  const parsed = Number(rounds)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('NWSAPI_PLANNER_ROUNDS must be an integer from 1 to 100.')
  }
  settings.rounds = parsed
}
if (milliseconds) {
  const parsed = Number(milliseconds)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 3_600_000) {
    throw new Error(
      'NWSAPI_PLANNER_MILLISECONDS must be an integer from 1 to 3600000.',
    )
  }
  settings.milliseconds = parsed
}
if (phase === 'collect' && existsSync(output) && readdirSync(output).length) {
  throw new Error('Collection requires a new empty output directory: ' + output)
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
  format: 2,
  contractVersion,
  ...provenance(),
  candidateSha256: sha256(readFileSync(baselinePath())),
  scenario: 'has',
  settings,
  pass: pass || 'initial',
  fixtureSha256: sha256(readFileSync(fixtureFile)),
  power: checkedPower(),
  featureNames: [
    'anchorCount',
    'witnessCount',
    'attributeMask',
    'witnessRatio',
  ],
  routeLabels:
    phase === 'collect'
      ? ['baseline', 'forward-after-preflight', 'inverse-after-preflight']
      : [
          'rule',
          phase === 'confirm'
            ? 'guarded implementation'
            : phase === 'preflight'
              ? 'empty-witness preflight'
              : 'trained',
        ],
}
if (phase !== 'collect') {
  assertRoutes(entries, probeSource())
}
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
if (phase === 'collect') {
  writeFileSync(
    path.join(output, 'contract-vectors.json'),
    JSON.stringify(
      {
        version: contractVersion,
        vectors: contractVectors(),
      },
      null,
      2,
    ) + '\n',
  )
  writeFileSync(
    path.join(output, 'experiment.json'),
    JSON.stringify(
      {
        ...metadata,
        variants: sources.map(sha256),
        gate: { geometricSpeedRatio: 1.05, worstTimeRatio: 1.15 },
        baseline: 'Unmodified build, measured directly as variant zero',
        scope:
          'Warm all-results queries; forced routes retain witness preflight',
        split: entries.map(entry => ({
          id: entry.id,
          family: entry.family,
          split: entry.split,
        })),
      },
      null,
      2,
    ) + '\n',
  )
}
for (const host of ['chromium', 'jsdom']) {
  const power = checkedPower()
  const startedAt = new Date().toISOString()
  console.log(
    `${host}: ${phase}${pass ? ' ' + pass : ''} (${selected.length} cases)`,
  )
  const evidence =
    phase === 'collect'
      ? host === 'chromium'
        ? await browserEvidence(selected, instrumentedVariants())
        : jsdomEvidence(selected, instrumentedVariants())
      : undefined
  if (evidence) {
    writeFileSync(
      path.join(output, `${host}-route-evidence.json`),
      JSON.stringify(evidence, null, 2) + '\n',
    )
  }
  const result =
    host === 'chromium'
      ? await measureBrowser(selected, sources)
      : { rows: await measureJsdom(selected, sources), version: metadata.jsdom }
  const data = {
    metadata: {
      ...metadata,
      power,
      powerAfter: checkedPower(),
      startedAt,
      finishedAt: new Date().toISOString(),
      host,
      version: result.version,
      variants: sources.map(sha256),
    },
    rows: result.rows.map((row, index) => ({
      ...row,
      ...(evidence ? { routeEvidence: evidence[index] } : {}),
    })),
  }
  writeFileSync(
    path.join(
      output,
      `${host}-${phase === 'collect' ? 'training' : phase === 'evaluate' ? 'evaluation' : phase === 'confirm' ? 'confirmation' : 'preflight'}${pass ? '-repeat' : ''}.json`,
    ),
    JSON.stringify(data, null, 2) + '\n',
  )
}
