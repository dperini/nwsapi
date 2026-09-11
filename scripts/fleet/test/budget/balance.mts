import { readFileSync } from 'node:fs'

import process from 'node:process'
import { parseBalanceArgs } from './balance/options.mts'
import { isMainModule } from '../../../repo/lib/run-node.mts'
import { readCompletedFiles } from './balance/input.mts'
import { planRecoveryShards, recoveryChecks } from './balance/plan.mts'

export function runBalance(args: string[]): number {
  const options = parseBalanceArgs(args)
  const { budgetMs, elapsedMs } = options
  const files = readCompletedFiles(
    JSON.parse(readFileSync(options.report, 'utf8')),
  )
  const shards = planRecoveryShards(
    files,
    options.shards ?? Math.min(5, files.length),
  )
  const exceeded = elapsedMs > budgetMs
  const result = {
    diagnostic: true,
    gateEvidence: false,
    scope: 'whole-command',
    status: exceeded ? 'over-budget' : 'within-budget-sample',
    budgetMs,
    elapsedMs,
    overrunMs: Math.max(0, elapsedMs - budgetMs),
    fileCount: files.length,
    testCount: files.reduce((total, file) => total + file.tests, 0),
    slowestFiles: files
      .toSorted((a, b) => b.durationMs - a.durationMs)
      .slice(0, options.top),
    checks: recoveryChecks(),
    shards,
    limitations: [
      'File times are scheduling weights, not predicted shard wall time. Worker overlap and setup costs differ.',
      'This proposal does not change Vitest scheduling. The built-in --shard flag does not consume this assignment.',
      'Inventory is checked against the supplied report, not independent test discovery. Verify its original scope.',
      'One sample cannot establish stable headroom. Separate CI runners add capacity. More local shards may add contention.',
    ],
  }
  console.log(
    options.json
      ? JSON.stringify(result, null, 2)
      : formatBalanceSummary(result),
  )
  return exceeded ? 1 : 0
}

export function formatBalanceSummary(result: {
  status: string
  elapsedMs: number
  budgetMs: number
  fileCount: number
  testCount: number
  slowestFiles: Array<{ name: string; durationMs: number }>
  shards: Array<{ index: number; files: unknown[]; fileTimeMs: number }>
  checks: Array<{ id: string; action: string }>
}): string {
  return [
    `Test budget: ${result.status}. ${(result.elapsedMs / 1000).toFixed(2)}s elapsed / ${(result.budgetMs / 1000).toFixed(2)}s budget.`,
    `${result.testCount} tests across ${result.fileCount} files. Diagnostic only.`,
    'Slowest files:',
    ...result.slowestFiles.map(
      file => `  ${file.durationMs.toFixed(1)}ms ${file.name}`,
    ),
    'Proposed shards (summed file time, not predicted runtime):',
    ...result.shards.map(
      shard =>
        `  ${shard.index}/${result.shards.length}: ${shard.files.length} files, ${shard.fileTimeMs.toFixed(1)}ms weight`,
    ),
    'Next checks:',
    ...result.checks.map(check => `  ${check.id}: ${check.action}`),
    'This proposal does not change scheduling. Use --json for full assignments. One run cannot establish stable headroom.',
  ].join('\n')
}

export function main(): number {
  try {
    return runBalance(process.argv.slice(2))
  } catch (error) {
    console.error(
      `test budget balance: ${error instanceof Error ? error.message : String(error)} Run with --help for examples.`,
    )
    return 2
  }
}

export const help = `Usage: node scripts/fleet/test/budget/balance.mts -r <vitest.json> --budget <duration> --elapsed <duration> [options]

Required:
  -r, --report <path>    Completed Vitest JSON results, not a profiling report.
  --budget <duration>   Whole-command budget, such as 10s or 500ms.
  --elapsed <duration>  Measured whole-command wall time, such as 69.08s or 2m.

Options:
  --shards <count>      Positive whole number. Default: up to 5, capped by file count.
  --top <count>         Number of expensive files to show. Default: 10.
  --json               Print JSON, including full proposed shard assignments.
  --budget-ms <ms>      Compatibility alias for --budget. Do not combine them.
  --elapsed-ms <ms>     Compatibility alias for --elapsed. Do not combine them.
  -h, --help           Show this help without reading the report.

Examples:
  node scripts/fleet/test/budget/balance.mts -r /tmp/vitest.json --budget 10s --elapsed 69.08s
  node scripts/fleet/test/budget/balance.mts -r /tmp/vitest.json --budget 10s --elapsed 69.08s --shards 3 --json > /tmp/balance.json

Exit 0: sample within budget. Exit 1: over budget. Exit 2: invalid input or incomplete evidence.
Durations need u/us (microseconds), ms, s, m, or h units. Elapsed time is never inferred from overlapping file times.
This diagnostic proposes assignments. It does not change Vitest scheduling or certify a gate.`

if (isMainModule(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(help)
  } else {
    process.exitCode = main()
  }
}
