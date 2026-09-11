import { parseArgs } from 'node:util'

const millisecondsPerUnit: Record<string, number> = {
  h: 3_600_000,
  m: 60_000,
  ms: 1,
  s: 1000,
  u: 0.001,
  us: 0.001,
}

export function parseDuration(value: string | undefined, flag: string): number {
  // Match a decimal number followed by an explicit duration unit. Both u and us mean microseconds.
  const match = value?.match(/^(\d+(?:\.\d+)?)(us|u|ms|s|m|h)$/u)
  if (!match) {
    throw new Error(
      `${flag} needs a positive duration with a unit, using u/us, ms, s, m, or h (for example 500us or 1h).`,
    )
  }
  const milliseconds = Number(match[1]) * millisecondsPerUnit[match[2]!]!
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error(`${flag} must be greater than zero and finite.`)
  }
  return milliseconds
}

export function resolveDuration(
  value: string | undefined,
  legacy: string | undefined,
  flag: string,
): number {
  if (value !== undefined && legacy !== undefined) {
    throw new Error(`Use either ${flag} or ${flag}-ms, not both.`)
  }
  return parseDuration(
    value ?? (legacy === undefined ? undefined : `${legacy}ms`),
    flag,
  )
}

export function parsePositiveInteger(value: string, flag: string): number {
  const count = Number(value)
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(count) || count < 1) {
    throw new Error(`${flag} needs a positive whole number, such as 5.`)
  }
  return count
}

export function parseBalanceArgs(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      report: { type: 'string', short: 'r' },
      budget: { type: 'string' },
      elapsed: { type: 'string' },
      'budget-ms': { type: 'string' },
      'elapsed-ms': { type: 'string' },
      shards: { type: 'string' },
      top: { type: 'string', default: '10' },
      json: { type: 'boolean', default: false },
    },
  })
  if (!values.report?.trim()) {
    throw new Error(
      'Provide --report <vitest.json> (or -r). This must be a completed Vitest JSON report, not a profiler report.',
    )
  }
  return {
    report: values.report,
    budgetMs: resolveDuration(values.budget, values['budget-ms'], '--budget'),
    elapsedMs: resolveDuration(
      values.elapsed,
      values['elapsed-ms'],
      '--elapsed',
    ),
    shards:
      values.shards === undefined
        ? undefined
        : parsePositiveInteger(values.shards, '--shards'),
    top: parsePositiveInteger(values.top, '--top'),
    json: values.json,
  }
}
