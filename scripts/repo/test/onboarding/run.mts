import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainModule } from '../../lib/run-node.mts'
import { makeSandbox } from './isolation.mts'
import { readJourney } from './readme.mts'
import { startGuide } from './guide.mts'
import {
  exactManagerVersionCommand,
  externalToolVersion,
  redact,
} from './environment.mts'
import { verifyMinimumNodeBootstrap } from './handoff.mts'
import { runReadmeHarnessSteps } from './readme/harness.mts'
import { runBounded } from './process.mts'
import * as reviewReports from './reports.mts'
import {
  runJourney,
  runPlainSetupMenu,
  runPlainSetupPreview,
  verifyInstalledCheckout,
} from './scenario.mts'
import type { GuideOutcome, ScenarioOptions } from './scenario.mts'
import {
  checkoutSnapshot,
  prepareEnvironment,
  verifySnapshotIntegrity,
} from './snapshot.mts'
import type { SnapshotContext } from './snapshot.mts'
import {
  parseOnboardingArguments,
  parseOnboardingControls,
  presentOnboardingRequest,
} from './contract.mts'

const REPO = fileURLToPath(new URL('../../../../', import.meta.url))
const LOG_ROOT = path.join(REPO, '.cache/onboarding')
const TIMEOUT = 20 * 60_000
const phases: Outcome[] = []
let cleanupSandbox: (() => Promise<void>) | undefined
let keepSandbox = false
let activeLog = ''
let activeScenario: Options['scenario'] | undefined
let activeCommit: string | undefined
let activeSandbox = ''
let retainedArtifacts: string[] = []
let entryNodeVersion = ''
const managerVersions: Record<string, string> = {}
type Options = ScenarioOptions
interface Outcome {
  phase: string
  command: string
  status: string
  code: number | null
  durationMs?: number
}

export function run(
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout = TIMEOUT,
) {
  const started = Date.now()
  if (
    process.platform === 'win32' &&
    executable.toLowerCase().endsWith('.cmd')
  ) {
    const invocation = `"${executable}" ${args.map(value => `"${value.replaceAll('"', '""')}"`).join(' ')}`
    const result = spawnSync(
      process.env['ComSpec'] ?? 'cmd.exe',
      ['/d', '/s', '/c', invocation],
      {
        cwd,
        env,
        encoding: 'utf8',
        timeout,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      },
    )
    return {
      code: result.status,
      durationMs: Date.now() - started,
      signal: result.signal,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      error: result.error ?? undefined,
    }
  }
  const result = spawnSync(executable, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  })
  return {
    code: result.status,
    durationMs: Date.now() - started,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? undefined,
  }
}

export async function appendLog(
  file: string,
  phase: string,
  result: Omit<ReturnType<typeof run>, 'durationMs'> & {
    durationMs?: number
  },
) {
  const durationMs = result.durationMs ?? 0
  const body = redact(
    `\n## ${phase}\ndurationMs=${durationMs} exit=${result.code ?? 'null'} signal=${result.signal ?? 'none'}\n${result.stdout}\n${result.stderr}\n`,
  )
  await writeFile(file, body, { flag: 'a' })
  phases.push({
    phase,
    command: phase,
    status: !result.error && result.code === 0 ? 'completed' : 'failed',
    code: result.code,
    durationMs,
  })
  if (result.error) {
    throw result.error
  }
  if (result.code !== 0) {
    throw new Error(
      `${phase} failed (exit ${result.code ?? 'null'}). See ${file}`,
    )
  }
}

export async function command(
  file: string,
  phase: string,
  executable: string,
  args: string[],
  checkout: string,
  env: NodeJS.ProcessEnv,
  timeout = TIMEOUT,
  expected: number | null = 0,
) {
  const started = Date.now()
  const result = await runBounded(executable, args, checkout, env, timeout)
  const durationMs = Date.now() - started
  const commandText = `${path.basename(executable)} ${args.join(' ')}`
  await writeFile(
    file,
    redact(
      `\n## ${phase}\n$ ${commandText}\ndurationMs=${durationMs} exit=${result.code ?? 'null'} signal=${result.signal ?? 'none'}\n${result.stdout}\n${result.stderr}\n`,
    ),
    { flag: 'a' },
  )
  phases.push({
    phase,
    command: commandText,
    status:
      !result.error &&
      ((expected !== null && result.code === expected) ||
        (expected === null && result.code === 0))
        ? 'completed'
        : 'failed',
    code: result.code,
    durationMs,
  })
  if (result.error) {
    throw result.error
  }
  if (expected !== null && result.code !== expected) {
    throw new Error(
      `${phase} returned ${result.code ?? 'null'}, expected ${expected}. See ${file}`,
    )
  }
  return result
}

export async function runScenario(
  options: Options,
  log: string,
  context: SnapshotContext,
) {
  const preview = await runPlainSetupPreview(
    log,
    context.snapshot,
    options.node,
    context.env,
    redact,
  )
  phases.push(preview)
  if (preview.error) {
    throw new Error(preview.error)
  }
  if (options.scenario === 'bootstrap') {
    await verifyMinimumNodeBootstrap(
      log,
      context.snapshot,
      options.node,
      context.env,
      command,
    )
    await runReadmeHarnessSteps(
      log,
      context.snapshot,
      options.node,
      context.env,
      command,
    )
    return
  }
  if (options.scenario === 'npm' || options.scenario === 'pnpm') {
    await runManagerScenario(
      options as Options & { scenario: 'npm' | 'pnpm' },
      log,
      context,
    )
    return
  }
  await runGuidedScenario(options, log, context)
}

export async function runGuidedScenario(
  options: Options,
  log: string,
  context: SnapshotContext,
  installed = false,
) {
  await runJourney(
    log,
    context.snapshot,
    options.node,
    context.env,
    command,
    startGuide,
    redact,
    recordGuideOutcome,
    async () => {
      const outcome = await runPlainSetupMenu(
        log,
        context.snapshot,
        options.node,
        context.env,
        redact,
      )
      phases.push(outcome)
      if (outcome.error) {
        throw new Error(outcome.error)
      }
    },
    installed,
  )
}

export async function runManagerScenario(
  options: ScenarioOptions & { scenario: 'npm' | 'pnpm' },
  log: string,
  context: SnapshotContext,
) {
  const managerName = options.scenario
  const manager = options[managerName]
  const stepId = `${managerName}-install`
  const step = (await readJourney(context.snapshot)).find(
    candidate => candidate.id === stepId,
  )
  if (!manager || !step || step.command[0] !== managerName) {
    throw new Error(`README ${stepId} command or --${managerName} is missing.`)
  }
  const versionCommand = exactManagerVersionCommand(manager, options.node)
  const version = await command(
    log,
    `${managerName} exact version`,
    versionCommand.executable,
    versionCommand.args,
    context.snapshot,
    context.env,
    15_000,
  )
  const expected = await externalToolVersion(context.snapshot, managerName)
  if (version.stdout.trim() !== expected) {
    throw new Error(
      `${managerName} must be ${expected}; got ${version.stdout.trim()}.`,
    )
  }
  managerVersions[managerName] = version.stdout.trim()
  await command(
    log,
    `literal README ${stepId}`,
    process.platform === 'win32' ? `${managerName}.cmd` : managerName,
    step.command.slice(1),
    context.snapshot,
    context.env,
  )
  await runReadmeHarnessSteps(
    log,
    context.snapshot,
    options.node,
    context.env,
    command,
  )
  await runGuidedScenario(options, log, context, true)
}

export function recordGuideOutcome(outcome: GuideOutcome) {
  phases.push({
    phase: 'guide persistent server',
    command: outcome.command,
    status: 'completed',
    code: outcome.code,
    ...(outcome.durationMs === undefined
      ? {}
      : { durationMs: outcome.durationMs }),
  })
}

export async function verifyFinalState(
  options: Options,
  log: string,
  context: SnapshotContext,
) {
  for (const artifact of ['node_modules', 'dist']) {
    if (!existsSync(path.join(context.snapshot, artifact))) {
      throw new Error(`Onboarding did not create ${artifact}/.`)
    }
  }
  await verifyInstalledCheckout(
    log,
    context.snapshot,
    options.node,
    context.env,
    command,
    managerVersions,
  )
  await verifySnapshotIntegrity(context)
}

export async function main(
  options = parseOnboardingArguments(process.argv.slice(2)),
) {
  activeScenario = options.scenario
  await mkdir(LOG_ROOT, { recursive: true })
  const sandbox = await makeSandbox()
  activeSandbox = sandbox.directory
  cleanupSandbox = sandbox.cleanup
  keepSandbox = options.keep ?? false
  const log = path.join(
    LOG_ROOT,
    `${options.scenario}-${new Date().toISOString().replaceAll(':', '-')}.log`,
  )
  activeLog = log
  const environment = await prepareEnvironment(options, sandbox.directory)
  const context = await checkoutSnapshot(
    options,
    log,
    sandbox.directory,
    environment,
    run,
    appendLog,
    command,
    managerVersions,
    commit => {
      activeCommit = commit
    },
    REPO,
  )
  entryNodeVersion = context.nodeVersion
  activeCommit = context.initialCommit
  await runScenario(options, log, context)
  await verifyFinalState(options, log, context)
  await writeSummary('completed', context.initialCommit)
  console.log(
    JSON.stringify({
      scenario: options.scenario,
      status: 'completed',
      node: entryNodeVersion,
      managers: managerVersions,
      commit: context.initialCommit,
      log,
      outcomes: phases,
    }),
  )
}

export async function writeSummary(
  status: string,
  commit?: string,
  message?: string,
) {
  const summary = {
    scenario: activeScenario ?? 'unknown',
    status,
    entryNodeVersion: entryNodeVersion || null,
    managerVersions,
    commit: commit ?? activeCommit ?? null,
    artifacts: retainedArtifacts.map(file => path.relative(LOG_ROOT, file)),
    message: message ? redact(message) : null,
    failures: await reviewReports.readReviewFailures(retainedArtifacts),
    phases,
  }
  if (activeLog) {
    await writeFile(
      `${activeLog}.summary.json`,
      `${JSON.stringify(summary, null, 2)}\n`,
    )
  }
  return summary
}

export async function execute(argv = process.argv.slice(2)) {
  const controls = parseOnboardingControls(argv)
  const options = parseOnboardingArguments(controls.args)
  if (
    presentOnboardingRequest(controls, options, REPO, os.tmpdir(), console.log)
  ) {
    return
  }
  try {
    await main(options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (activeScenario !== 'bootstrap' && activeSandbox) {
      try {
        retainedArtifacts = await reviewReports.retainFailedReviewReports({
          sandbox: activeSandbox,
          destination: `${activeLog}.artifacts`,
          redact,
        })
      } catch {
        retainedArtifacts = []
      }
    }
    const summary = await writeSummary('failed', activeCommit, message)
    if (activeLog) {
      const reports = retainedArtifacts.length
        ? `retained reports=${retainedArtifacts.map(file => path.relative(LOG_ROOT, file)).join(', ')}`
        : 'retained reports=none'
      await writeFile(
        activeLog,
        `\n## summary\nstatus=failed\nmessage=${redact(message)}\nphases=${JSON.stringify(phases)}\n${reports}\n`,
        { flag: 'a' },
      )
    }
    reviewReports.emitOnboardingFailure(summary, activeLog || null)
    process.exitCode = 1
  } finally {
    if (!keepSandbox) {
      await cleanupSandbox?.()
    }
  }
}

if (isMainModule(import.meta.url)) {
  void execute()
}
