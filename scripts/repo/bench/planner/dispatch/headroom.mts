import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../lib/run-node.mts'
import { sha256 } from '../../footprint/shared.mts'
import type { TrainingRow } from '../neural/export.mts'
import { split } from './fixtures.mts'
import { weightsPath } from './paths.mts'

interface Bounds {
  domain: number[][]
  chosen: { categoricalPairs: number[][] }
}

function supported(row: TrainingRow, bounds: Bounds) {
  if (!row.decisionReached || !row.routeFacts) {
    return false
  }
  const [anchors, witnesses, attributes, ratio] = row.features
  const dense = Number(row.routeFacts.denseInverse)
  const values = [anchors, witnesses, attributes, dense, ratio]
  return (
    values.every(
      (value, index) =>
        value >= bounds.domain[0]![index]! &&
        value <= bounds.domain[1]![index]!,
    ) &&
    bounds.chosen.categoricalPairs.some(
      ([mask, flag]) => mask === attributes && flag === dense,
    )
  )
}

function ceiling(rows: TrainingRow[], allow: (row: TrainingRow) => boolean) {
  let logSpeed = 0
  let baseline = 0
  let selected = 0
  let changes = 0
  for (const row of rows) {
    const base = row.baselineCostNs
    const alternative = row.costsNs[row.baselineRoute === 'forward' ? 1 : 0]
    const cost =
      row.decisionReached && allow(row) ? Math.min(base, alternative) : base
    logSpeed += Math.log(base / cost)
    baseline += base
    selected += cost
    changes += Number(cost < base)
  }
  return {
    cases: rows.length,
    changedCases: changes,
    geometricTimePercent: 100 / Math.exp(logSpeed / rows.length),
    totalTimePercent: (100 * selected) / baseline,
  }
}

export function audit(collection: string, model: string, output: string) {
  const blob = readFileSync(path.join(collection, 'dataset/dataset.json'))
  const evaluation = JSON.parse(
    readFileSync(path.join(model, 'evaluation.json'), 'utf8'),
  ) as { datasetSha256: string }
  if (evaluation.datasetSha256 !== sha256(blob)) {
    throw new Error('Model and collection use different datasets.')
  }
  const { rows } = JSON.parse(blob.toString()) as { rows: TrainingRow[] }
  const hosts = ['chromium', 'jsdom'] as const
  const results = Object.fromEntries(
    hosts.map(host => {
      const controls = rows.filter(
        row => row.host === host && split(row.family) === 'development',
      )
      if (!controls.length) {
        throw new Error('Missing development controls for ' + host)
      }
      const bounds = JSON.parse(
        readFileSync(weightsPath(model, host), 'utf8'),
      ) as Bounds
      return [
        host,
        {
          anyRoute: ceiling(controls, () => true),
          forwardOnly: ceiling(
            controls,
            row => row.baselineRoute === 'forward',
          ),
          supportedForwardOnly: ceiling(
            controls,
            row => row.baselineRoute === 'forward' && supported(row, bounds),
          ),
        },
      ]
    }),
  )
  writeFileSync(
    output,
    JSON.stringify(
      {
        sourceDatasetSha256: sha256(blob),
        scope: 'Previously examined development controls only.',
        method:
          'Optimistic hindsight choices from saved median route costs. No decision overhead. Every case chooses independently, even when inputs are identical. This is a diagnostic, not a measured implementation.',
        results,
      },
      null,
      2,
    ) + '\n',
  )
}

if (isMainModule(import.meta.url)) {
  const [collection, model, output] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log('Usage: dispatch/headroom.mts collection model output.json')
  } else if (!collection || !model || !output) {
    throw new Error('Collection, model, and output file required.')
  } else {
    audit(collection, model, output)
  }
}
