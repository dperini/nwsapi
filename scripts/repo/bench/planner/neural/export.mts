import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { isMainModule } from '../../../lib/run-node.mts'
import { REPO_ROOT } from '../../../lib/paths.mts'
import { sha256 } from '../../footprint/shared.mts'

interface MeasurementRow {
  id: string
  family: string
  split: 'train' | 'holdout'
  fixtureSha256: string
  features: number[]
  costs: number[]
}

interface MeasurementFile {
  metadata: {
    candidateSha256: string
    fixtureSha256: string
    power: string
    host: string
    featureNames: string[]
  }
  rows: MeasurementRow[]
}

interface TrainingRow {
  id: string
  family: string
  split: 'train' | 'holdout'
  host: 'chromium' | 'jsdom'
  features: [number, number, number, number]
  costsNs: [number, number]
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
      const features = row.features
      const costsNs = [row.costs[1], row.costs[2]]
      if (
        features.length !== 4 ||
        features.some(value => !Number.isFinite(value) || value < 0) ||
        costsNs.some(value => !Number.isFinite(value) || value! <= 0)
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
    format: 1,
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
    },
    rows,
  }

  mkdirSync(outputDirectory, { recursive: true })
  const output = path.join(outputDirectory, 'dataset.json')
  writeFileSync(output, JSON.stringify(dataset, null, 2) + '\n')
  return { output, rows: rows.length, source: dataset.source }
}

if (isMainModule(import.meta.url)) {
  const [
    input = 'assets/repo/bench/planner-has-neural-2026-10-04',
    output = 'assets/repo/bench/planner-neural-2026-10-04',
  ] = process.argv.slice(2)
  console.log(exportDataset(input, output))
}
