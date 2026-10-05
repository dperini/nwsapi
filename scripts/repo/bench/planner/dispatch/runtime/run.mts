import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { isMainModule } from '../../../../lib/run-node.mts'
import { provenance, sha256 } from '../../../footprint/shared.mts'
import { measureBrowser, measureJsdom, settings } from '../../measure.mts'
import type { Row } from '../../measure.mts'
import { browserEvidence, jsdomEvidence } from '../../has/evidence.mts'
import type { Evidence } from '../../has/evidence.mts'
import { routeBundle } from '../../has/instrument.mts'
import { referenceRoute } from '../../has/contract.mts'
import type { Override } from '../variants.mts'
import { checkedPower } from '../../has/power.mts'
import { crossedFixtures } from '../crossed.mts'
import { diagnosticFixtures } from '../diagnostic.mts'
import { geomean } from '../../neural/oracle.mts'

const labels = [
  'Before integration',
  'Integrated disabled',
  'Integrated model',
  'Cached model',
]

function profile(source: string, host: string, disabled = false) {
  return (
    source +
    `\nvar originalFactory = module.exports;
module.exports = function (window) {
  var engine = originalFactory(window);
  engine.useNeuralPlanner(${disabled ? 'null' : JSON.stringify(host)});
  return engine;
};\nObject.assign(module.exports, originalFactory);\n`
  )
}

function summarize(rows: Row[]) {
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

function verifyRoutes(row: Evidence, mask: number, choose: Override) {
  for (const [index, trace] of row.traces.entries()) {
    assert.ok(trace.facts, row.id)
    let expected = referenceRoute(trace.facts)
    if (
      index >= 2 &&
      expected === 'forward' &&
      mask &&
      choose(
        trace.facts.anchors,
        trace.facts.witnesses!,
        mask,
        +trace.facts.denseInverse,
        trace.facts.witnesses! / trace.facts.anchors,
      )
    ) {
      expected = 'inverse'
    }
    assert.equal(trace.route, expected, `${row.id} variant ${index}`)
  }
  assert.deepEqual(
    row.traces[2]!.route,
    row.traces[3]!.route,
    'Cache changed routing',
  )
}

function readBuild(file: string) {
  const bytes = readFileSync(file)
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString()
}

export async function runtime(
  uncachedPath: string,
  cachedPath: string,
  output: string,
  repeat = false,
) {
  assert.ok(!existsSync(output), 'Use a new measurement directory')
  mkdirSync(output, { recursive: true })
  const uncached = readBuild(uncachedPath)
  const cached = readBuild(cachedPath)
  const archived = gunzipSync(
    readFileSync(
      'assets/repo/bench/planner-dispatch-jit-2026-10-05-r1/chromium-variant-0.cjs.gz',
    ),
  ).toString()
  writeFileSync(path.join(output, 'uncached.cjs.gz'), gzipSync(uncached))
  writeFileSync(path.join(output, 'cached.cjs.gz'), gzipSync(cached))
  const crossed = crossedFixtures().filter(
    entry =>
      !entry.id.startsWith('crossed-') || /^crossed-[4-7]-/.test(entry.id),
  )
  const fixtures = [...crossed, ...diagnosticFixtures()]
  const entries = repeat ? fixtures.toReversed() : fixtures
  settings.rounds = 9
  settings.milliseconds = repeat ? 16 : 12
  writeFileSync(
    path.join(output, 'fixtures.json.gz'),
    gzipSync(JSON.stringify(entries)),
  )
  for (const host of ['chromium', 'jsdom']) {
    const sources = [
      archived,
      profile(uncached, host, true),
      profile(uncached, host),
      profile(cached, host),
    ]
    const choose = (await import(
      path.resolve(
        'assets/repo/bench/planner-dispatch-crossed-model-2026-10-05-r1',
        `${host}.mjs`,
      )
    )) as { dispatchOverride: Override }
    const probes = entries.filter(entry =>
      /^crossed-4-(32|96|192)-4-3$/.test(entry.id),
    )
    const maskById = new Map(
      probes.map(entry => [entry.id, entry.plannerFeatures![2]]),
    )
    const verify = (row: Evidence) =>
      verifyRoutes(row, maskById.get(row.id)!, choose.dispatchOverride)
    const probeSources = [
      routeBundle(archived, 'baseline', true),
      profile(routeBundle(uncached, 'baseline', true), host, true),
      profile(routeBundle(uncached, 'baseline', true), host),
      profile(routeBundle(cached, 'baseline', true), host),
    ]
    const traces =
      host === 'chromium'
        ? await browserEvidence(probes, probeSources, verify)
        : jsdomEvidence(probes, probeSources, verify)
    // Reverse versions as well as cases while retaining canonical output order.
    const timed = repeat ? sources.toReversed() : sources
    const power = checkedPower()
    const result =
      host === 'chromium'
        ? await measureBrowser(entries, timed)
        : {
            version: provenance().jsdom,
            rows: await measureJsdom(entries, timed),
          }
    const rows = result.rows.map(row =>
      repeat
        ? {
            ...row,
            samples: row.samples.toReversed(),
            calls: row.calls.toReversed(),
            costs: row.costs.toReversed(),
          }
        : row,
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
            settings,
            labels,
            variants: sources.map(sha256),
            scope:
              'Existing diagnostic and crossed holdout cases plus older controls. Tuning evidence, not new independent qualification.',
            repeat,
          },
          rows,
          traces,
          summaries: {
            all: summarize(rows),
            older: summarize(
              rows.filter(
                row =>
                  !row.id.startsWith('crossed-') &&
                  !row.id.startsWith('diagnostic-'),
              ),
            ),
            crossed: summarize(
              rows.filter(row => row.id.startsWith('crossed-')),
            ),
            diagnostic: summarize(
              rows.filter(row => row.id.startsWith('diagnostic-')),
            ),
            unfiltered: summarize(rows.filter(row => row.features[2] === 0)),
          },
        },
        null,
        2,
      ) + '\n',
    )
    sources.forEach((source, index) =>
      writeFileSync(
        path.join(output, `${host}-variant-${index}.cjs.gz`),
        gzipSync(source),
      ),
    )
  }
}

if (isMainModule(import.meta.url)) {
  const [uncached, cached, output, pass] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: dispatch/runtime/run.mts uncached.cjs cached.cjs new-output-directory [repeat]',
    )
  } else if (!uncached || !cached || !output || (pass && pass !== 'repeat')) {
    throw new Error(
      'Provide uncached and cached builds, a new directory and optional repeat',
    )
  } else {
    await runtime(uncached, cached, output, pass === 'repeat')
  }
}
