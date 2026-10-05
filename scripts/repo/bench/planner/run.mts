import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { provenance, sha256 } from '../footprint/shared.mts'
import { fixtures } from './fixtures.mts'
import type { Fixture } from './fixtures.mts'
import { fit } from './fit.mts'
import {
  assertRoutes,
  measureBrowser,
  measureJsdom,
  settings,
} from './measure.mts'
import type { Row } from './measure.mts'
import { decide, expression, train } from './model.mts'
import type { Domain, Tree } from './model.mts'
import { variants } from './variants.mts'

const [phase, output] = process.argv.slice(2)
if (!output || !['collect', 'evaluate'].includes(phase!)) {
  throw new Error('Usage: planner/run.mts collect|evaluate output-directory')
}
mkdirSync(output, { recursive: true })
const metadata = {
  ...provenance(),
  settings,
  power:
    process.platform === 'darwin'
      ? execFileSync('/usr/bin/pmset', ['-g', 'batt'], {
          encoding: 'utf8',
        }).trim()
      : 'unknown',
  fixtureGeneratorSha256: sha256(
    readFileSync(new URL('./fixtures.mts', import.meta.url)),
  ),
}
const write = (name: string, value: unknown) =>
  writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n')
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
assertRoutes(entries)
for (const host of ['chromium', 'jsdom']) {
  const filename = `${host}-training.json`
  const previous =
    phase === 'evaluate'
      ? (JSON.parse(
          readFileSync(path.join(output, 'shared-model.json'), 'utf8'),
        ) as {
          model: Tree
          domain: Domain
          baseline: { candidateSha256: string }
        })
      : undefined
  if (
    previous &&
    previous.baseline.candidateSha256 !== metadata.candidateSha256
  ) {
    throw new Error('Recollect training data after changing the runtime build.')
  }
  const sources = variants(previous)
  const selected =
    phase === 'collect'
      ? entries
      : entries.filter(entry => entry.split === 'holdout')
  const result =
    host === 'chromium'
      ? await measureBrowser(selected, sources)
      : { rows: await measureJsdom(selected, sources), version: metadata.jsdom }
  const details = {
    metadata: {
      ...metadata,
      host,
      version: result.version,
      variants: sources.map(sha256),
    },
    rows: result.rows,
  }
  if (phase === 'collect') {
    const model = train(
      result.rows
        .filter(row => row.split === 'train')
        .map(row => ({
          features: row.features,
          costs: [row.costs[1]!, row.costs[2]!],
        })),
    )
    write(filename, {
      ...details,
      model,
      expression: expression(model),
      predictions: predict(result.rows, model),
    })
  } else {
    write(`${host}-evaluation.json`, details)
  }
}

if (phase === 'collect') {
  fit(output)
}

function predict(rows: Row[], model: Tree) {
  return rows.map(row => {
    const broad = decide(model, row.features)
    return {
      id: row.id,
      broad,
      selectedNs: row.costs[broad ? 2 : 1],
      ruleNs: row.costs[0],
      oracleNs: Math.min(row.costs[1]!, row.costs[2]!),
    }
  })
}
