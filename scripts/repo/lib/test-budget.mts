import { spawn } from 'node:child_process'

// Whole-run ceilings, including startup/build/coverage; never per-test timeouts.
export const TEST_BUDGET_MS = Object.freeze({
  unit: 10_000,
  integration: 60_000,
  upstream: 600_000,
})

// Instrumentation adds process startup, source transforms, and report writes.
// Keep the ordinary unit lane at 10s while giving its coverage run measured
// headroom above the 10.1–11.1s totals observed locally and in CI.
export const COVERAGE_TEST_BUDGET_MS = Object.freeze({
  unit: 15_000,
  integration: 60_000,
})

export function testBudget(lane: string, coverage: boolean) {
  if (coverage && lane in COVERAGE_TEST_BUDGET_MS) {
    return COVERAGE_TEST_BUDGET_MS[lane as keyof typeof COVERAGE_TEST_BUDGET_MS]
  }
  return TEST_BUDGET_MS[lane as keyof typeof TEST_BUDGET_MS]
}

export function runBudgeted(
  args: string[],
  budgetMs: number,
  label: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const grouped = process.platform !== 'win32'
    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env,
      detached: grouped,
    })
    const start = performance.now()
    let expired = false
    let escalation: ReturnType<typeof setTimeout> | undefined
    const stop = (signal: NodeJS.Signals) => {
      try {
        if (grouped && child.pid) {
          process.kill(-child.pid, signal)
        } else {
          child.kill(signal)
        }
      } catch (error) {
        if (
          !(error instanceof Error && 'code' in error && error.code === 'ESRCH')
        ) {
          throw error
        }
      }
    }
    const onInterrupt = () => stop('SIGINT')
    const onTerminate = () => stop('SIGTERM')
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    const cleanup = () => {
      clearTimeout(timer)
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
    }
    const timer = setTimeout(() => {
      expired = true
      console.error(`[test] ${label} exceeded its ${budgetMs} ms budget`)
      stop('SIGTERM')
      escalation = setTimeout(() => stop('SIGKILL'), 1000)
      escalation.unref()
    }, budgetMs)
    child.once('error', error => {
      cleanup()
      reject(error)
    })
    child.once('exit', code => {
      cleanup()
      // An expired process can leave workers behind even after it exits.
      if (expired) {
        stop('SIGKILL')
      }
      if (escalation) {
        clearTimeout(escalation)
      }
      const elapsed = Math.round(performance.now() - start)
      console.log(`[test] ${label}: ${elapsed} ms / ${budgetMs} ms`)
      resolve(expired || elapsed > budgetMs ? 1 : (code ?? 1))
    })
  })
}
