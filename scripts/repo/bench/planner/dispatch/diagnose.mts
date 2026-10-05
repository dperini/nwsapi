import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { setImmediate } from 'node:timers/promises'
import { isMainModule } from '../../../lib/run-node.mts'
import { provenance, sha256 } from '../../footprint/shared.mts'
import { measureBrowser, measureJsdom, settings } from '../measure.mts'
import type { Row } from '../measure.mts'
import { browserEvidence, jsdomEvidence } from '../has/evidence.mts'
import type { Evidence } from '../has/evidence.mts'
import { referenceRoute } from '../has/contract.mts'
import { routeBundle } from '../has/instrument.mts'
import { checkedPower } from '../has/power.mts'
import { baselinePath } from '../has/variants.mts'
import { geomean } from '../neural/oracle.mts'
import { crossedFixtures } from './crossed.mts'
import { diagnosticFixtures } from './diagnostic.mts'
import { dispatchBundle } from './variants.mts'
import type { Override } from './variants.mts'
import { splitDispatchBundle, unfilteredCertificate } from './specialize.mts'

const labels = [
  'Current v3',
  'Metadata only',
  'No-op dispatch',
  'Frozen model',
  'Split model',
  'Split rule',
]

function variants(
  baseline: string,
  model: string,
  rule: string,
  instrument = false,
) {
  const annotated = baseline.replace(
    'anchor: anchor,',
    'attributeMask: (parts[1].indexOf("[") < 0 ? 0 : 2) + (parts[2].indexOf("[") < 0 ? 0 : 1), anchor: anchor,',
  )
  return [
    instrument ? routeBundle(annotated, 'baseline', true) : baseline,
    routeBundle(annotated, 'baseline', instrument),
    dispatchBundle(
      baseline,
      'function dispatchOverride() { return false; }',
      instrument,
      true,
    ),
    dispatchBundle(baseline, model, instrument, true),
    splitDispatchBundle(baseline, model, instrument),
    splitDispatchBundle(baseline, rule, instrument),
  ]
}

function verify(row: Evidence, model: Override, rule: Override) {
  for (const [index, trace] of row.traces.entries()) {
    if (!trace.facts) {
      assert.equal(trace.route, 'ineligible', row.id)
      continue
    }
    let expected = referenceRoute(trace.facts)
    const choose = index === 5 ? rule : model
    if (
      index >= 3 &&
      expected === 'forward' &&
      trace.features &&
      choose(
        trace.features[0]!,
        trace.features[1]!,
        trace.features[2]!,
        +trace.facts.denseInverse,
        trace.features[3]!,
      )
    ) {
      expected = 'inverse'
    }
    assert.equal(trace.route, expected, `${row.id} variant ${index}`)
  }
  assert.equal(
    row.traces[3]!.route,
    row.traces[4]!.route,
    'Split changed the model route',
  )
}

async function evidence(
  host: string,
  entries: ReturnType<typeof diagnosticFixtures>,
  sources: string[],
  model: Override,
  rule: Override,
) {
  const check = (row: Evidence) => verify(row, model, rule)
  if (host === 'chromium') {
    return browserEvidence(entries, sources, check)
  }
  const rows: Evidence[] = []
  for (let index = 0; index < entries.length; index += 8) {
    rows.push(...jsdomEvidence(entries.slice(index, index + 8), sources, check))
    await setImmediate()
  }
  return rows
}

function summary(rows: Row[]) {
  return labels.map((label, index) => ({
    label,
    cases: rows.length,
    geometricTimePercent:
      100 * geomean(rows.map(row => row.costs[index]! / row.costs[0]!)),
    totalTimePercent:
      (100 * rows.reduce((sum, row) => sum + row.costs[index]!, 0)) /
      rows.reduce((sum, row) => sum + row.costs[0]!, 0),
    worstTimeRatio: Math.max(
      ...rows.map(row => row.costs[index]! / row.costs[0]!),
    ),
  }))
}

function summaries(rows: Row[]) {
  const fresh = rows.filter(row => row.family !== 'reproduction')
  return {
    fresh: summary(fresh),
    unfiltered: summary(fresh.filter(row => row.features[2] === 0)),
    filtered: summary(fresh.filter(row => row.features[2] !== 0)),
    reproduction: summary(rows.filter(row => row.family === 'reproduction')),
  }
}

export async function diagnose(
  modelDirectory: string,
  output: string,
  repeat = false,
) {
  assert.ok(!existsSync(output), 'Use a new diagnostic directory')
  mkdirSync(output, { recursive: true })
  settings.rounds = 11
  settings.milliseconds = repeat ? 24 : 20
  const reproduction = crossedFixtures()
    .filter(entry =>
      ['crossed-7-192-4-0', 'crossed-7-96-4-0', 'crossed-7-192-2.5-0'].includes(
        entry.id,
      ),
    )
    .map(entry => ({ ...entry, family: 'reproduction' }))
  const all = [...diagnosticFixtures(), ...reproduction]
  const entries = repeat ? all.toReversed() : all
  const baseline = readFileSync(baselinePath(), 'utf8')
  const evaluation = JSON.parse(
    readFileSync(path.join(modelDirectory, 'evaluation.json'), 'utf8'),
  ) as {
    results: Record<string, { modelSha256: string; ruleSha256: string }>
  }
  writeFileSync(
    path.join(output, 'fixtures.json.gz'),
    gzipSync(JSON.stringify(entries)),
  )
  for (const host of ['chromium', 'jsdom']) {
    const model = readFileSync(path.join(modelDirectory, `${host}.mjs`), 'utf8')
    const rule = readFileSync(
      path.join(modelDirectory, `${host}-rule.mjs`),
      'utf8',
    )
    assert.equal(sha256(model), evaluation.results[host]!.modelSha256)
    assert.equal(sha256(rule), evaluation.results[host]!.ruleSha256)
    const choose = (await import(
      path.resolve(modelDirectory, `${host}.mjs`)
    )) as { dispatchOverride: Override }
    const chooseRule = (await import(
      path.resolve(modelDirectory, `${host}-rule.mjs`)
    )) as { dispatchOverride: Override }
    const sources = variants(baseline, model, rule)
    const traces = await evidence(
      host,
      entries,
      variants(baseline, model, rule, true),
      choose.dispatchOverride,
      chooseRule.dispatchOverride,
    )
    const power = checkedPower()
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
            ...provenance(),
            host,
            version: result.version,
            power,
            powerAfter: checkedPower(),
            settings,
            labels,
            variants: sources.map(sha256),
            modelDirectory,
            modelCertificate: unfilteredCertificate(model),
            ruleCertificate: unfilteredCertificate(rule),
            scope:
              '96 fresh diagnostic cases with frozen policies, plus three previously examined reproduction cases. No training or threshold selection.',
          },
          rows: result.rows,
          traces,
          summaries: summaries(result.rows),
        },
        null,
        2,
      ) + '\n',
    )
    for (const [index, source] of sources.entries()) {
      writeFileSync(
        path.join(output, `${host}-variant-${index}.cjs.gz`),
        gzipSync(source),
      )
    }
  }
}

if (isMainModule(import.meta.url)) {
  const [model, output, pass] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: dispatch/diagnose.mts frozen-model new-output-directory [repeat]',
    )
  } else if (!model || !output || (pass && pass !== 'repeat')) {
    throw new Error('Frozen model and a new output directory required.')
  } else {
    await diagnose(model, output, pass === 'repeat')
  }
}
