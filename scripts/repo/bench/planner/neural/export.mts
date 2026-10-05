import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../lib/run-node.mts'
import { REPO_ROOT } from '../../../lib/paths.mts'
import { sha256 } from '../../footprint/shared.mts'
import type { Evidence } from '../has/evidence.mts'
import { verifyEvidence } from '../has/evidence.mts'
import type { Route, RouteFacts } from '../has/contract.mts'

interface MeasurementRow {
  id: string
  family: string
  split: 'train' | 'holdout'
  fixtureSha256: string
  features: number[]
  costs: number[]
  samples: number[][]
  calls: number[][]
  routeEvidence: Evidence
}

interface MeasurementFile {
  metadata: {
    format: number
    contractVersion: number
    candidateSha256: string
    fixtureSha256: string
    power: string
    host: string
    featureNames: string[]
    routeLabels: string[]
  }
  rows: MeasurementRow[]
}

export interface TrainingRow {
  id: string
  family: string
  split: 'train' | 'holdout'
  host: 'chromium' | 'jsdom'
  features: [number, number, number, number]
  costsNs: [number, number]
  costSamplesNs: [number[], number[]]
  baselineCostNs: number
  baselineSamplesNs: number[]
  groupId: string
  decisionReached: boolean
  baselineRoute: Route
  routeFacts: RouteFacts | null
}

const hosts = ['chromium', 'jsdom'] as const

export function exportDataset(inputDirectory: string, outputDirectory: string) {
  const sources = hosts.map(host => {
    const filename = `${host}-training.json`
    const bytes = readFileSync(path.join(inputDirectory, filename))
    return {
      host,
      filename,
      sha256: sha256(bytes),
      data: JSON.parse(bytes.toString()) as MeasurementFile,
    }
  })
  const reference = sources[0]!.data.metadata
  if (
    sources.some(
      source =>
        source.data.metadata.format !== 2 ||
        source.data.metadata.contractVersion !== 2 ||
        source.data.metadata.routeLabels.join('|') !==
          'baseline|forward-after-preflight|inverse-after-preflight',
    )
  ) {
    throw new Error(
      'Expected version 2 measurements with proved routes. Recollect old data.',
    )
  }
  if (
    sources.some(
      source =>
        source.data.metadata.candidateSha256 !== reference.candidateSha256 ||
        source.data.metadata.fixtureSha256 !== reference.fixtureSha256 ||
        source.data.metadata.featureNames.join('|') !==
          reference.featureNames.join('|'),
    )
  ) {
    throw new Error('Host measurements use different builds or fixtures.')
  }

  const rows: TrainingRow[] = []
  for (const source of sources) {
    const byId = new Map(source.data.rows.map(row => [row.id, row]))
    if (byId.size !== source.data.rows.length) {
      throw new Error(`Duplicate ${source.host} planner measurement rows.`)
    }
    for (const row of source.data.rows) {
      verifyEvidence(row.routeEvidence)
      const baselineTrace = row.routeEvidence.traces[0]!
      if (row.routeEvidence.id !== row.id) {
        throw new Error('Route evidence belongs to another case: ' + row.id)
      }
      const features = row.features
      const costsNs = [row.costs[1], row.costs[2]]
      const costSamplesNs = [
        row.samples[1]!,
        row.samples[2]!,
      ] as TrainingRow['costSamplesNs']
      if (
        features.length !== 4 ||
        features.some(value => !Number.isFinite(value) || value < 0) ||
        row.costs.length !== 3 ||
        row.costs.some(value => !Number.isFinite(value) || value <= 0) ||
        row.samples.length !== 3 ||
        row.samples.some(
          samples =>
            samples.length < 3 ||
            samples.some(value => !Number.isFinite(value) || value <= 0),
        )
      ) {
        throw new Error(
          `Invalid route measurements for ${source.host}/${row.id}.`,
        )
      }
      rows.push({
        id: row.id,
        family: row.family,
        split: row.split,
        host: source.host,
        features: features as TrainingRow['features'],
        costsNs: costsNs as TrainingRow['costsNs'],
        costSamplesNs,
        baselineCostNs: row.costs[0]!,
        baselineSamplesNs: row.samples[0]!,
        groupId: row.family,
        decisionReached: baselineTrace.decisions > 0,
        baselineRoute: baselineTrace.route,
        routeFacts: baselineTrace.facts,
      })
    }
  }

  const chromiumRows = sources[0]!.data.rows
  const jsdomRows = sources[1]!.data.rows
  if (
    chromiumRows.length !== jsdomRows.length ||
    chromiumRows.some((row, index) => {
      const other = jsdomRows[index]
      return (
        row.id !== other?.id ||
        row.family !== other.family ||
        row.split !== other.split ||
        row.fixtureSha256 !== other.fixtureSha256 ||
        row.features.join('|') !== other.features.join('|')
      )
    })
  ) {
    throw new Error(
      'Chromium and jsdom rows do not describe matching fixtures.',
    )
  }

  const dataset = {
    format: 2,
    contractVersion: 2,
    evaluationPurpose:
      'development; these fixture families have been examined before',
    scenario: 'css-has-forward-versus-inverse-route',
    labelMeaning: 'costsNs are [forward, inverse] median query times',
    features: reference.featureNames,
    source: {
      directory: path.relative(REPO_ROOT, inputDirectory),
      candidateSha256: reference.candidateSha256,
      fixtureSha256: reference.fixtureSha256,
      powerByHost: Object.fromEntries(
        sources.map(source => [source.host, source.data.metadata.power]),
      ),
      inputs: sources.map(({ host, filename, sha256: digest }) => ({
        host,
        filename,
        sha256: digest,
      })),
      experimentSha256: sha256(
        readFileSync(path.join(inputDirectory, 'experiment.json')),
      ),
    },
    rows,
  }

  mkdirSync(outputDirectory, { recursive: true })
  const output = path.join(outputDirectory, 'dataset.json')
  writeFileSync(output, JSON.stringify(dataset, null, 2) + '\n')
  return { output, rows: rows.length, source: dataset.source }
}

if (isMainModule(import.meta.url)) {
  const [input, output] = process.argv.slice(2)
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: neural/export.mts measurements-directory new-output-directory',
    )
  } else if (!input || !output) {
    throw new Error('Explicit measurement and output directories are required.')
  } else {
    console.log(exportDataset(input, output))
  }
}
