import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../lib/run-node.mts'
import { geomean } from '../neural/oracle.mts'
import { split } from './fixtures.mts'

interface TraceRow {
  id: string
  traces: Array<{ route: string }>
}
interface Confirmation {
  metadata: { variants: string[] }
  rows: Array<{
    id: string
    family: string
    costs: number[]
    features: number[]
  }>
  traces: TraceRow[]
  ruleTraces: TraceRow[]
}

function load(directory: string, host: string): Confirmation {
  return JSON.parse(
    readFileSync(path.join(directory, `${host}.json`), 'utf8'),
  ) as Confirmation
}

function routeMap(rows: TraceRow[]) {
  const entries = new Map(
    rows.map(row => [row.id, row.traces.map(trace => trace.route)]),
  )
  assert.equal(entries.size, rows.length, 'Duplicate trace IDs')
  return entries
}

function groupComparison(
  data: Confirmation,
  group: string,
  feature?: { index: number; value: number },
) {
  const modelRoutes = routeMap(data.traces)
  const ruleRoutes = routeMap(data.ruleTraces)
  const rows = data.rows.filter(
    row =>
      split(row.family) === group &&
      (!feature || row.features[feature.index] === feature.value),
  )
  const differences: string[] = []
  for (const row of rows) {
    const model = modelRoutes.get(row.id)
    const rule = ruleRoutes.get(row.id)
    assert.ok(model?.length && rule?.length, 'Missing route evidence')
    if (JSON.stringify(model) !== JSON.stringify(rule)) {
      differences.push(row.id)
    }
  }
  assert.ok(rows.length, 'Empty comparison group')
  return {
    cases: rows.length,
    differentRouteCases: differences,
    modelTimePercentOfBaseline:
      100 * geomean(rows.map(row => row.costs[2]! / row.costs[0]!)),
    ruleTimePercentOfBaseline:
      100 * geomean(rows.map(row => row.costs[1]! / row.costs[0]!)),
    modelTimePercentOfRule:
      100 * geomean(rows.map(row => row.costs[2]! / row.costs[1]!)),
  }
}

function evaluationSlices(first: Confirmation, repeat: Confirmation) {
  const slices: Record<string, unknown> = {}
  for (const [name, index] of [
    ['anchors', 0],
    ['filters', 2],
  ] as const) {
    const values = new Set(
      first.rows
        .filter(row => split(row.family) === 'evaluation')
        .map(row => row.features[index]!),
    )
    for (const value of [...values].toSorted((a, b) => a - b)) {
      const feature = { index, value }
      slices[`${name}-${value}`] = {
        first: groupComparison(first, 'evaluation', feature),
        repeat: groupComparison(repeat, 'evaluation', feature),
      }
    }
  }
  return slices
}

export function compare(first: string, repeat: string, output: string) {
  if (existsSync(output)) {
    throw new Error('Use a new comparison output file.')
  }
  const hosts: Record<string, unknown> = {}
  for (const host of ['chromium', 'jsdom']) {
    const initial = load(first, host)
    const reversed = load(repeat, host)
    assert.deepEqual(
      initial.metadata.variants,
      reversed.metadata.variants,
      'Repeat changed the measured code',
    )
    assert.deepEqual(
      initial.rows.map(row => row.id).toSorted(),
      reversed.rows.map(row => row.id).toSorted(),
      'Repeat changed the cases',
    )
    hosts[host] = {
      evaluationSlices: evaluationSlices(initial, reversed),
      groups: Object.fromEntries(
        ['evaluation', 'development', 'validation'].map(group => [
          group,
          {
            first: groupComparison(initial, group),
            repeat: groupComparison(reversed, group),
          },
        ]),
      ),
    }
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        format: 1,
        first,
        repeat,
        scope:
          'Saved complete-query measurements. Identical routes do not establish better learned decisions. Timing differences can reflect emitted code and measurement variation.',
        hosts,
      },
      null,
      2,
    ) + '\n',
  )
}

if (isMainModule(import.meta.url)) {
  const [first, repeat, output] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log('Usage: dispatch/compare.mts first repeat new-output.json')
  } else if (!first || !repeat || !output) {
    throw new Error('Two confirmations and an output file are required.')
  } else {
    compare(first, repeat, output)
  }
}
