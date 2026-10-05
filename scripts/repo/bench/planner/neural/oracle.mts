import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../lib/run-node.mts'
import { sha256 } from '../../footprint/shared.mts'
import type { TrainingRow } from './export.mts'

export function geomean(values: number[]) {
  if (!values.length) {
    return 1
  }
  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  )
}

export function comparableCosts(row: TrainingRow) {
  const baseline = row.baselineCostNs
  if (!row.decisionReached) {
    return [baseline, baseline, baseline]
  }
  return [
    baseline,
    row.baselineRoute === 'forward' ? baseline : row.costsNs[0],
    row.baselineRoute === 'inverse' ? baseline : row.costsNs[1],
  ] as number[]
}

function featureKey(row: TrainingRow) {
  return JSON.stringify([
    row.host,
    row.decisionReached,
    ...row.features,
    row.routeFacts?.denseInverse ?? false,
  ])
}

function groupsByFeatures(rows: TrainingRow[]) {
  const groups = new Map<string, TrainingRow[]>()
  for (const row of rows) {
    const key = featureKey(row)
    const group = groups.get(key) || []
    group.push(row)
    groups.set(key, group)
  }
  return groups
}

export function summarizeOracle(rows: TrainingRow[]) {
  const groups = groupsByFeatures(rows)
  const groupChoices = new Map<string, number>()
  for (const [key, group] of groups) {
    const loss = [0, 1, 2].map(action =>
      group.reduce(
        (sum, row) =>
          sum + Math.log(comparableCosts(row)[action]! / row.baselineCostNs),
        0,
      ),
    )
    groupChoices.set(key, loss.indexOf(Math.min(...loss)))
  }
  const cases = rows.map(row => {
    const costs = comparableCosts(row)
    const optimistic = row.decisionReached
      ? Math.min(row.baselineCostNs, ...row.costsNs)
      : row.baselineCostNs
    const conservative = Math.min(...costs)
    const observable = costs[groupChoices.get(featureKey(row))!]!
    return {
      id: row.id,
      group: row.groupId,
      baselineNs: row.baselineCostNs,
      optimisticNs: optimistic,
      conservativeNs: conservative,
      currentInputOracleNs: observable,
      maximumAddedWorkNs: row.baselineCostNs - conservative,
      decisionReached: row.decisionReached,
    }
  })
  const groupRatios = new Map<string, number[]>()
  for (const entry of cases) {
    const ratios = groupRatios.get(entry.group) || []
    ratios.push(entry.baselineNs / entry.conservativeNs)
    groupRatios.set(entry.group, ratios)
  }
  return {
    cases: rows.length,
    decisions: cases.filter(row => row.decisionReached).length,
    featureGroups: groups.size,
    singletonGroups: [...groups.values()].filter(group => group.length === 1)
      .length,
    optimisticSpeedRatio: geomean(
      cases.map(row => row.baselineNs / row.optimisticNs),
    ),
    conservativeSpeedRatio: geomean(
      cases.map(row => row.baselineNs / row.conservativeNs),
    ),
    currentInputEmpiricalSpeedRatio: geomean(
      cases.map(row => row.baselineNs / row.currentInputOracleNs),
    ),
    equalFamilyConservativeSpeedRatio: geomean(
      [...groupRatios.values()].map(geomean),
    ),
    casesWithOver200nsHeadroom: cases.filter(
      row => row.maximumAddedWorkNs > 200,
    ).length,
    details: cases,
  }
}

export function writeOracle(directory: string) {
  const bytes = readFileSync(path.join(directory, 'dataset.json'))
  const data = JSON.parse(bytes.toString()) as {
    format: number
    rows: TrainingRow[]
  }
  if (data.format !== 2) {
    throw new Error('Oracle requires corrected version 2 data.')
  }
  const result = {
    format: 2,
    datasetSha256: sha256(bytes),
    scope:
      'Development diagnostics. Hindsight fits observed cases and cannot establish generalization.',
    aliases:
      'Conservative oracle treats the baseline route as exactly baseline, eliminating same-route timing wins.',
    results: Object.fromEntries(
      ['chromium', 'jsdom'].map(host => [
        host,
        summarizeOracle(data.rows.filter(row => row.host === host)),
      ]),
    ),
  }
  writeFileSync(
    path.join(directory, 'oracle.json'),
    JSON.stringify(result, null, 2) + '\n',
  )
  return Object.fromEntries(
    Object.entries(result.results).map(
      ([host, { details: _details, ...summary }]) => [host, summary],
    ),
  )
}

if (isMainModule(import.meta.url)) {
  const [directory] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log('Usage: neural/oracle.mts dataset-directory')
  } else if (!directory) {
    throw new Error('Dataset directory is required.')
  } else {
    console.log(writeOracle(directory))
  }
}
