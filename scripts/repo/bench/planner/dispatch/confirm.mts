import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { setImmediate } from 'node:timers/promises'
import { isMainModule } from '../../../lib/run-node.mts'
import { provenance, sha256 } from '../../footprint/shared.mts'
import { measureBrowser, measureJsdom, settings } from '../measure.mts'
import { checkedPower } from '../has/power.mts'
import { baselinePath } from '../has/variants.mts'
import { jsdomEvidence, browserEvidence } from '../has/evidence.mts'
import type { Evidence } from '../has/evidence.mts'
import { referenceRoute } from '../has/contract.mts'
import type { Fixture } from '../fixtures.mts'
import { geomean } from '../neural/oracle.mts'
import { dispatchBundle } from './variants.mts'
import type { Override } from './variants.mts'
import { split } from './fixtures.mts'
import { splitDispatchBundle } from './specialize.mts'

interface Evaluation {
  datasetSha256: string
  policy?: string
  scope?: string
  results: Record<
    string,
    {
      status: string
      modelSha256: string
      ruleSha256: string
      chosen: { forwardOnlyProof: { proved: boolean } }
      simpleRule: { forwardOnly: boolean; policies?: number[][] }
    }
  >
}

async function parityPolicy(model: string, name: string, expectedHash: string) {
  const source = readFileSync(path.join(model, `${name}.mjs`))
  assert.equal(sha256(source), expectedHash)
  const { dispatchOverride } = (await import(
    path.resolve(model, `${name}.mjs`)
  )) as {
    dispatchOverride: Override
  }
  const cases = JSON.parse(
    readFileSync(path.join(model, `${name}-parity.json`), 'utf8'),
  ) as Array<{ features: number[]; override: boolean }>
  for (const row of cases) {
    const [a, w, attributes, dense, ratio] = row.features
    assert.equal(
      dispatchOverride(a!, w!, attributes!, dense!, ratio!),
      row.override,
      name + ' parity mismatch',
    )
  }
  for (const invalid of [NaN, Infinity, -Infinity]) {
    for (let index = 0; index < 5; ++index) {
      const values = [128, 512, 3, 0, 4]
      values[index] = invalid
      assert.equal(
        dispatchOverride(
          values[0]!,
          values[1]!,
          values[2]!,
          values[3]!,
          values[4]!,
        ),
        false,
      )
    }
  }
  return cases.length
}

export async function parity(model: string, evaluation: Evaluation) {
  const cases: Record<string, number> = {}
  const ruleCases: Record<string, number> = {}
  for (const host of ['chromium', 'jsdom']) {
    cases[host] = await parityPolicy(
      model,
      host,
      evaluation.results[host]!.modelSha256,
    )
    if (existsSync(path.join(model, `${host}-rule-parity.json`))) {
      ruleCases[host] = await parityPolicy(
        model,
        `${host}-rule`,
        evaluation.results[host]!.ruleSha256,
      )
    }
  }
  return { cases, ruleCases, mismatches: 0 }
}

async function routeEvidence(
  entries: Fixture[],
  source: string,
  choose: Override,
  host: string,
  memoize = false,
) {
  const verify = (row: Evidence) => {
    const trace = row.traces[0]!
    if (!trace.facts) {
      assert.equal(trace.route, 'ineligible')
      return
    }
    let route = referenceRoute(trace.facts)
    if (
      trace.features &&
      trace.facts.weakMapAvailable &&
      choose(
        trace.features[0]!,
        trace.features[1]!,
        trace.features[2]!,
        +trace.facts.denseInverse,
        trace.features[3]!,
      )
    ) {
      route = route === 'forward' ? 'inverse' : 'forward'
    }
    assert.equal(trace.route, route, row.id + ' emitted route mismatch')
    if (
      memoize &&
      trace.features &&
      referenceRoute(trace.facts) === 'forward' &&
      trace.facts.weakMapAvailable
    ) {
      assert.equal(trace.cacheHits, 1, row.id + ' expected decision cache hit')
      assert.equal(
        trace.inferences || 0,
        0,
        row.id + ' unexpected repeated inference',
      )
    }
  }
  if (host === 'chromium') {
    return browserEvidence(entries, [source], verify, memoize ? 3 : 1)
  }
  const results: Evidence[] = []
  for (let index = 0; index < entries.length; index += 8) {
    results.push(
      ...jsdomEvidence(
        entries.slice(index, index + 8),
        [source],
        verify,
        memoize ? 3 : 1,
      ),
    )
    await setImmediate()
  }
  return results
}

function summary(rows: Array<{ costs: number[] }>, index: number) {
  const speed = geomean(rows.map(row => row.costs[0]! / row.costs[index]!))
  const total =
    rows.reduce((sum, row) => sum + row.costs[0]!, 0) /
    rows.reduce((sum, row) => sum + row.costs[index]!, 0)
  const worst = Math.max(...rows.map(row => row.costs[index]! / row.costs[0]!))
  return {
    cases: rows.length,
    geometricSpeedRatio: speed,
    totalTimeSpeedRatio: total,
    worstTimeRatio: worst,
    passesGate: speed >= 1.05 && total >= 1 && worst <= 1.15,
  }
}

function policyBundle(
  baseline: string,
  policy: string,
  instrument: boolean,
  forwardOnly: boolean,
  splitMatcher: boolean,
) {
  if (splitMatcher) {
    assert.ok(forwardOnly, 'Split matching requires a forward-only policy')
    return splitDispatchBundle(baseline, policy, instrument)
  }
  return dispatchBundle(baseline, policy, instrument, forwardOnly)
}

async function measureHost(
  host: string,
  entries: Fixture[],
  collection: string,
  model: string,
  output: string,
  evaluation: Evaluation,
  familyCounts: Record<string, number>,
  memoize: boolean,
  splitMatcher: boolean,
) {
  const baseline = gunzipSync(
    readFileSync(path.join(collection, 'route-0.cjs.gz')),
  ).toString()
  const modelSource = readFileSync(path.join(model, `${host}.mjs`), 'utf8')
  const ruleSource = readFileSync(path.join(model, `${host}-rule.mjs`), 'utf8')
  assert.equal(sha256(ruleSource), evaluation.results[host]!.ruleSha256)
  const sources = [
    baseline,
    policyBundle(
      baseline,
      ruleSource,
      false,
      evaluation.results[host]!.simpleRule.forwardOnly,
      splitMatcher,
    ),
    policyBundle(
      baseline,
      modelSource,
      false,
      evaluation.results[host]!.chosen.forwardOnlyProof.proved,
      splitMatcher,
    ),
  ]
  if (memoize) {
    sources.push(
      dispatchBundle(
        baseline,
        modelSource,
        false,
        evaluation.results[host]!.chosen.forwardOnlyProof.proved,
        true,
      ),
      dispatchBundle(
        baseline,
        ruleSource,
        false,
        evaluation.results[host]!.simpleRule.forwardOnly,
        true,
      ),
    )
  }
  const { dispatchOverride } = (await import(
    path.resolve(model, `${host}.mjs`)
  )) as {
    dispatchOverride: Override
  }
  const traces = await routeEvidence(
    entries,
    policyBundle(
      baseline,
      modelSource,
      true,
      evaluation.results[host]!.chosen.forwardOnlyProof.proved,
      splitMatcher,
    ),
    dispatchOverride,
    host,
  )
  const { dispatchOverride: ruleOverride } = (await import(
    path.resolve(model, `${host}-rule.mjs`)
  )) as { dispatchOverride: Override }
  const ruleTraces = await routeEvidence(
    entries,
    policyBundle(
      baseline,
      ruleSource,
      true,
      evaluation.results[host]!.simpleRule.forwardOnly,
      splitMatcher,
    ),
    ruleOverride,
    host,
  )
  const cachedTraces = memoize
    ? await routeEvidence(
        entries,
        dispatchBundle(baseline, modelSource, true, true, true),
        dispatchOverride,
        host,
        true,
      )
    : []
  const cachedRuleTraces = memoize
    ? await routeEvidence(
        entries,
        dispatchBundle(baseline, ruleSource, true, true, true),
        ruleOverride,
        host,
        true,
      )
    : []
  const power = checkedPower()
  const result =
    host === 'chromium'
      ? await measureBrowser(entries, sources)
      : {
          version: provenance().jsdom,
          rows: await measureJsdom(entries, sources),
        }
  const validation = result.rows.filter(
    row => split(row.family) === 'validation',
  )
  const development = result.rows.filter(
    row => split(row.family) === 'development',
  )
  const evaluationRows = result.rows.filter(
    row => split(row.family) === 'evaluation',
  )
  const groups = { validation, development, evaluation: evaluationRows }
  const summaries = Object.fromEntries(
    Object.entries(groups)
      .filter(([, rows]) => rows.length)
      .map(([group, rows]) => [
        group,
        {
          model: summary(rows, 2),
          simpleRule: summary(rows, 1),
          ...(memoize
            ? { cachedModel: summary(rows, 3), cachedRule: summary(rows, 4) }
            : {}),
        },
      ]),
  )
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
          labels: [
            'Current v3',
            evaluation.results[host]!.simpleRule.policies
              ? splitMatcher
                ? 'Split filter rule'
                : 'Filter-specific rule'
              : 'Simple rule',
            splitMatcher ? 'Split PyTorch model' : 'PyTorch route model',
            ...(memoize ? ['Cached PyTorch model', 'Cached filter rule'] : []),
          ],
          dispatchSpecialization: splitMatcher
            ? 'Unfiltered selectors use the original matcher after parsing policy and baseline guards.'
            : undefined,
          settings,
          variants: sources.map(sha256),
          status: evaluation.results[host]!.status,
          policy: evaluation.policy,
          trainingScope: evaluation.scope,
          familyCounts,
          decisionCache: memoize
            ? 'One last answer keyed by anchors, witnesses, attributes, and dense. Ratio derived only on a miss.'
            : undefined,
        },
        rows: result.rows,
        traces,
        ruleTraces,
        cachedTraces,
        cachedRuleTraces,
        summaries,
      },
      null,
      2,
    ) + '\n',
  )
  writeFileSync(
    path.join(output, `${host}-candidate.cjs.gz`),
    gzipSync(sources[2]!),
  )
  if (splitMatcher) {
    writeFileSync(
      path.join(output, `${host}-rule-candidate.cjs.gz`),
      gzipSync(sources[1]!),
    )
  }
  if (memoize) {
    writeFileSync(
      path.join(output, `${host}-cached-candidate.cjs.gz`),
      gzipSync(sources[3]!),
    )
    writeFileSync(
      path.join(output, `${host}-cached-rule.cjs.gz`),
      gzipSync(sources[4]!),
    )
  }
  return summaries
}

export async function confirm(
  collection: string,
  model: string,
  output: string,
  repeat = false,
  memoize = false,
  splitMatcher = false,
) {
  assert.ok(
    !(memoize && splitMatcher),
    'Measure caching and split matching separately',
  )
  if (existsSync(output)) {
    throw new Error('Use a new confirmation directory.')
  }
  const evaluation = JSON.parse(
    readFileSync(path.join(model, 'evaluation.json'), 'utf8'),
  ) as Evaluation
  assert.equal(
    sha256(readFileSync(path.join(collection, 'dataset/dataset.json'))),
    evaluation.datasetSha256,
  )
  const baseline = gunzipSync(
    readFileSync(path.join(collection, 'route-0.cjs.gz')),
  ).toString()
  assert.equal(
    sha256(readFileSync(baselinePath())),
    sha256(baseline),
    'Recollect after build changes',
  )
  const parityResults = await parity(model, evaluation)
  mkdirSync(output, { recursive: true })
  writeFileSync(
    path.join(output, 'parity.json'),
    JSON.stringify(parityResults, null, 2) + '\n',
  )
  settings.rounds = 11
  settings.milliseconds = repeat ? 24 : 20
  const entries = JSON.parse(
    gunzipSync(
      readFileSync(path.join(collection, 'fixtures.json.gz')),
    ).toString(),
  ) as Fixture[]
  const results: Record<string, unknown> = {}
  for (const host of ['chromium', 'jsdom']) {
    const selected = entries.filter(entry => {
      const group = split(entry.family)
      return (
        group === 'development' ||
        group === 'validation' ||
        (group === 'evaluation' &&
          evaluation.results[host]!.status === 'validation-passed')
      )
    })
    results[host] = await measureHost(
      host,
      repeat ? selected.toReversed() : selected,
      collection,
      model,
      output,
      evaluation,
      Object.fromEntries(
        ['train', 'validation', 'evaluation'].map(group => [
          group,
          new Set(
            entries
              .filter(entry => split(entry.family) === group)
              .map(entry => entry.family),
          ).size,
        ]),
      ),
      memoize,
      splitMatcher,
    )
  }
  writeFileSync(
    path.join(output, 'summary.json'),
    JSON.stringify(results, null, 2) + '\n',
  )
}

if (isMainModule(import.meta.url)) {
  const [collection, model, output, pass] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: dispatch/confirm.mts collection model new-output-directory [repeat|cached|repeat-cached|split|repeat-split]',
    )
  } else if (
    !collection ||
    !model ||
    !output ||
    (pass &&
      !['repeat', 'cached', 'repeat-cached', 'split', 'repeat-split'].includes(
        pass,
      ))
  ) {
    throw new Error('Collection, model, output, and optional repeat required.')
  } else {
    await confirm(
      collection,
      model,
      output,
      pass?.startsWith('repeat'),
      pass?.includes('cached'),
      pass?.includes('split'),
    )
  }
}
