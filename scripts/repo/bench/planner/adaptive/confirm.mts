import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { isMainModule } from '../../../lib/run-node.mts'
import { provenance, sha256 } from '../../footprint/shared.mts'
import { checkedPower } from '../has/power.mts'
import { baselinePath } from '../has/variants.mts'
import { measureBrowser, measureJsdom, settings } from '../measure.mts'
import { geomean } from '../neural/oracle.mts'
import type { Fixture } from '../fixtures.mts'
import { adaptiveBundle } from './variants.mts'

export async function modelParity(directory: string) {
  const evaluation = JSON.parse(
    readFileSync(path.join(directory, 'evaluation.json'), 'utf8'),
  ) as {
    artifactSha256: Record<string, string>
  }
  for (const host of ['chromium', 'jsdom']) {
    assert.equal(
      sha256(readFileSync(path.join(directory, `${host}.mjs`), 'utf8')),
      evaluation.artifactSha256[host],
      'Exported model changed since training',
    )
  }
  const reference = JSON.parse(
    readFileSync(path.join(directory, 'parity-reference.json'), 'utf8'),
  ) as Array<{
    features: number[]
    logit: number
    switch: boolean
  }>
  const models = await Promise.all(
    ['chromium', 'jsdom'].map(
      host =>
        import(path.resolve(directory, `${host}.mjs`)) as Promise<{
          adaptiveChoice(
            a: number,
            k: number,
            pass: number,
            hit: number,
            candidates: number,
            dense: boolean,
          ): boolean
        }>,
    ),
  )
  for (const row of reference) {
    const [a, k, pass, hit, candidates, dense, host] = row.features
    const actual = models[host!]!.adaptiveChoice(
      a!,
      k!,
      pass!,
      hit!,
      candidates!,
      Boolean(dense),
    )
    assert.equal(actual, row.switch, 'PyTorch/JS continuation choice mismatch')
  }
  const result = { cases: reference.length, decisionDisagreements: 0 }
  writeFileSync(
    path.join(directory, 'parity.json'),
    JSON.stringify(result, null, 2) + '\n',
  )
  return result
}

export async function confirmAdaptive(
  input: string,
  model: string,
  output: string,
  repeat: boolean,
) {
  if (existsSync(output)) {
    throw new Error('Confirmation needs a new output directory.')
  }
  const training = JSON.parse(
    readFileSync(path.join(model, 'experiment.json'), 'utf8'),
  ) as {
    provenance: { inputs: Array<{ file: string; sha256: string }> }
  }
  for (const measured of training.provenance.inputs) {
    assert.equal(
      sha256(readFileSync(path.join(input, measured.file))),
      measured.sha256,
      'Collection differs from the model training inputs',
    )
  }
  const frozen = JSON.parse(
    readFileSync(path.join(input, 'experiment.json'), 'utf8'),
  ) as {
    prefix: number
    candidateSha256: string
  }
  const baseline = readFileSync(baselinePath(), 'utf8')
  assert.equal(
    sha256(baseline),
    frozen.candidateSha256,
    'Baseline changed since collection',
  )
  const entries = JSON.parse(
    gunzipSync(readFileSync(path.join(input, 'fixtures.json.gz'))).toString(),
  ) as Fixture[]
  if (repeat) {
    entries.reverse()
  }
  await modelParity(model)
  mkdirSync(output, { recursive: true })
  settings.rounds = 11
  settings.milliseconds = repeat ? 24 : 20
  for (const host of ['chromium', 'jsdom']) {
    const power = checkedPower()
    const modelSource = readFileSync(path.join(model, `${host}.mjs`), 'utf8')
    const sources = [
      baseline,
      adaptiveBundle('prefix-rule', frozen.prefix),
      adaptiveBundle(
        'prefix-rule',
        frozen.prefix,
        false,
        modelSource.replace(/^export /, ''),
      ),
    ]
    const startedAt = new Date().toISOString()
    console.log(`${host}: integrated adaptive model, ${entries.length} cases`)
    const result =
      host === 'chromium'
        ? await measureBrowser(entries, sources)
        : {
            version: provenance().jsdom,
            rows: await measureJsdom(entries, sources),
          }
    const ratios = result.rows.map(row => row.costs[0]! / row.costs[2]!)
    const ruleRatios = result.rows.map(row => row.costs[1]! / row.costs[2]!)
    const worst = Math.max(...ratios.map(ratio => 1 / ratio))
    const summary = {
      geometricSpeedRatio: geomean(ratios),
      worstTimeRatio: worst,
      speedRatioVsPrefixRule: geomean(ruleRatios),
      passesGate: geomean(ratios) >= 1.05 && worst <= 1.15,
    }
    writeFileSync(
      path.join(output, `${host}.json`),
      JSON.stringify(
        {
          metadata: {
            ...provenance(),
            host,
            version: result.version,
            purpose: 'development',
            labels: ['baseline', 'prefix-rule', 'neural'],
            repeat,
            settings,
            prefix: frozen.prefix,
            modelSha256: sha256(modelSource),
            variants: sources.map(sha256),
            power,
            powerAfter: checkedPower(),
            startedAt,
            finishedAt: new Date().toISOString(),
          },
          summary,
          rows: result.rows,
        },
        null,
        2,
      ) + '\n',
    )
    console.log(summary)
  }
}

if (isMainModule(import.meta.url)) {
  const [input, model, output, pass] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: adaptive/confirm.mts collection model new-output-directory [repeat]',
    )
  } else if (!input || !model || !output || (pass && pass !== 'repeat')) {
    throw new Error('Expected collection, model, output, and optional repeat.')
  } else {
    await confirmAdaptive(input, model, output, pass === 'repeat')
  }
}
