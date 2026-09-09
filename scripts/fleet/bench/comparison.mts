export interface BenchmarkRound {
  round: string | number
  cost: number
}

export interface BenchmarkSummary {
  count: number
  min: number
  median: number
  max: number
}

export interface BenchmarkRoundChange {
  round: string | number
  baseline: number
  candidate: number
  absoluteChange: number
  relativeChange: number
}

export interface BenchmarkComparison {
  rounds: BenchmarkRoundChange[]
  baseline: BenchmarkSummary
  candidate: BenchmarkSummary
  absoluteChange: BenchmarkSummary
  relativeChange: BenchmarkSummary
}

function summarizeBenchmarkValues(values: readonly number[]): BenchmarkSummary {
  const sorted = values.toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const upper = sorted[middle]!
  const lower = sorted[middle - 1] ?? upper
  const sum = lower + upper
  const summary = {
    __proto__: null,
    count: sorted.length,
    min: sorted[0]!,
    median:
      sorted.length % 2
        ? upper
        : Number.isFinite(sum)
          ? sum / 2
          : lower / 2 + upper / 2,
    max: sorted.at(-1)!,
  }
  return summary
}

function indexBenchmarkRounds(
  rounds: readonly BenchmarkRound[],
  label: string,
): Map<string | number, number> {
  if (!rounds.length) {
    throw new RangeError(
      `Missing benchmark rounds. Where: ${label}. Saw no measurements, wanted at least one. Fix: record matched baseline and candidate rounds.`,
    )
  }
  const indexed = new Map<string | number, number>()
  for (const { round, cost } of rounds) {
    if (
      !(
        (typeof round === 'string' && round.trim().length > 0) ||
        (typeof round === 'number' && Number.isFinite(round))
      ) ||
      !Number.isFinite(cost) ||
      cost <= 0
    ) {
      throw new RangeError(
        `Invalid benchmark measurement. Where: ${label}. Saw round ${String(round)} with cost ${cost}, wanted a nonempty string or finite numeric ID and finite positive cost. Fix: correct the recorded measurement.`,
      )
    }
    if (indexed.has(round)) {
      throw new RangeError(
        `Duplicate benchmark round. Where: ${label}. Saw repeated ID ${round}, wanted unique IDs. Fix: give each recorded round its own ID.`,
      )
    }
    indexed.set(round, cost)
  }
  return indexed
}

export function compareBenchmarkRounds(
  baselineRounds: readonly BenchmarkRound[],
  candidateRounds: readonly BenchmarkRound[],
): BenchmarkComparison {
  const baseline = indexBenchmarkRounds(baselineRounds, 'baseline')
  const candidate = indexBenchmarkRounds(candidateRounds, 'candidate')
  if (
    baseline.size !== candidate.size ||
    [...baseline.keys()].some(round => !candidate.has(round))
  ) {
    throw new RangeError(
      'Unmatched benchmark rounds. Where: comparison. Saw different round ID sets, wanted one candidate for every baseline. Fix: supply both measurements for each round.',
    )
  }
  const rounds = [...baseline].map(([round, baselineCost]) => {
    const candidateCost = candidate.get(round)!
    const absoluteChange = candidateCost - baselineCost
    // Relative change is (candidate - baseline) / baseline. Negative means lower cost.
    const relativeChange = absoluteChange / baselineCost
    if (!Number.isFinite(relativeChange)) {
      throw new RangeError(
        `Unrepresentable benchmark change. Where: round ${round}. Saw relative change ${relativeChange}, wanted a finite result. Fix: use measurements whose ratio fits a JavaScript number.`,
      )
    }
    return {
      __proto__: null,
      round,
      baseline: baselineCost,
      candidate: candidateCost,
      absoluteChange,
      relativeChange,
    }
  })
  const comparison = {
    __proto__: null,
    rounds,
    baseline: summarizeBenchmarkValues(rounds.map(round => round.baseline)),
    candidate: summarizeBenchmarkValues(rounds.map(round => round.candidate)),
    absoluteChange: summarizeBenchmarkValues(
      rounds.map(round => round.absoluteChange),
    ),
    relativeChange: summarizeBenchmarkValues(
      rounds.map(round => round.relativeChange),
    ),
  }
  return comparison
}
