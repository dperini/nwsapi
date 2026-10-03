import type { Measurement } from '../charts.mts'

export interface Report {
  metadata: {
    engines: Array<{ name: string }>
    timestamp: string
    runtime?: string
    host?: string
    cpu?: string
    power?: string
    rounds: number
    candidateSha256?: string
    queryState?: string
    timingEngine?: string
  }
  rows: Measurement[]
}

export function readReport(json: string): Report {
  const report = JSON.parse(json) as Report
  if (
    !report.metadata ||
    report.metadata.engines?.length !== 2 ||
    !report.rows?.length ||
    !Number.isInteger(report.metadata.rounds) ||
    report.metadata.rounds < 1
  ) {
    throw new TypeError(
      'Expected a two-engine benchmark report with rounds and rows.',
    )
  }
  for (const engine of report.metadata.engines) {
    if (typeof engine.name !== 'string') {
      throw new TypeError('Engine names must be strings.')
    }
  }
  for (const row of report.rows) {
    validateRow(row)
  }
  return report
}

function validateRow(row: Measurement) {
  if (
    typeof row.category !== 'string' ||
    typeof row.selector !== 'string' ||
    row.milliseconds?.length !== 2 ||
    row.errors?.length !== 2
  ) {
    throw new TypeError('Invalid benchmark row.')
  }
  for (let i = 0; i < 2; ++i) {
    const value = row.milliseconds[i]
    if (
      value !== null &&
      (typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value <= 0 ||
        row.errors[i] !== null)
    ) {
      throw new TypeError(
        'Timings must be positive and have no correctness error.',
      )
    }
    validateSamples(row.samples?.[i])
  }
}

function validateSamples(samples: number[] | undefined) {
  if (
    samples &&
    samples.some(sample => !Number.isFinite(sample) || sample <= 0)
  ) {
    throw new TypeError('Samples must be positive finite milliseconds.')
  }
}

export function speedup(row: Measurement) {
  const [candidate, competitor] = row.milliseconds
  return candidate && competitor ? competitor / candidate : null
}

export function duration(value: number | null | undefined) {
  if (value == null) {
    return 'unavailable'
  }
  return value < 1 ? `${(value * 1000).toFixed(2)}µs` : `${value.toFixed(2)}ms`
}

export function ratioLabel(row: Measurement) {
  const ratio = speedup(row)
  return ratio === null ? 'unavailable' : `${ratio.toFixed(2)}×`
}
