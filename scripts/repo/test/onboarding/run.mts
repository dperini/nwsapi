import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeSandbox } from './isolation.mts'
import { readJourney } from './readme.mts'
import { startGuide } from './guide.mts'
import { externalToolVersion, hashes, redact } from './environment.mts'
import { runBounded } from './process.mts'
import {
  runJourney,
  runReadmeHarnessSteps,
  verifyInstalledCheckout,
} from './scenario.mts'
import type { GuideOutcome, ScenarioOptions } from './scenario.mts'
import { checkoutSnapshot, prepareEnvironment } from './snapshot.mts'
import type { SnapshotContext } from './snapshot.mts'

const REPO = path.resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
)
const LOG_ROOT = path.join(REPO, '.cache/onboarding')
const TIMEOUT = 20 * 60_000
const cases = ['bootstrap', 'npm', 'pnpm', 'journey'] as const
const phases: Outcome[] = []
let cleanupSandbox: (() => Promise<void>) | undefined
let keepSandbox = false
let activeLog = ''
let activeScenario: Scenario | undefined
let entryNodeVersion = ''
const managerVersions: Record<string, string> = {}
type Scenario = (typeof cases)[number]
type Options = ScenarioOptions
interface Outcome {
  phase: string
  command: string
  status: string
  code: number | null
}

function parse(argv: string[]): Options {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]!
    if (!key.startsWith('--')) {
      throw new Error(`Unexpected argument: ${key}`)
    }
    if (key === '--keep') {
      values.set(key, 'true')
      continue
    }
    const value = argv[++index]
    if (!value) {
      throw new Error(`Missing value for ${key}`)
    }
    values.set(key, value)
  }
  return parseOptions(values)
}

function parseOptions(values: Map<string, string>): Options {
  const scenario = values.get('--scenario') as Scenario | undefined
  const node = values.get('--node')
  if (!scenario || !cases.includes(scenario)) {
    throw new Error(`Choose --scenario ${cases.join('|')}.`)
  }
  if (!node || !path.isAbsolute(node)) {
    throw new Error('Pass the absolute entry runtime path with --node.')
  }
  const npm = values.get('--npm')
  const pnpm = values.get('--pnpm')
  if ((npm && !path.isAbsolute(npm)) || (pnpm && !path.isAbsolute(pnpm))) {
    throw new Error('Pass absolute manager entry paths.')
  }
  if ((scenario === 'npm' && !npm) || (scenario === 'pnpm' && !pnpm)) {
    throw new Error(`Pass the pinned external ${scenario} entry point.`)
  }
  return {
    scenario,
    node,
    ...(npm ? { npm } : {}),
    ...(pnpm ? { pnpm } : {}),
    keep: values.has('--keep'),
  }
}

function run(
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout = TIMEOUT,
) {
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
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? undefined,
  }
}

async function appendLog(
  file: string,
  phase: string,
  result: ReturnType<typeof run>,
) {
  const body = redact(
    `\n## ${phase}\nexit=${result.code ?? 'null'} signal=${result.signal ?? 'none'}\n${result.stdout}\n${result.stderr}\n`,
  )
  await writeFile(file, body, { flag: 'a' })
  phases.push({
    phase,
    command: phase,
    status: result.code === 0 ? 'completed' : 'failed',
    code: result.code,
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

async function command(
  file: string,
  phase: string,
  executable: string,
  args: string[],
  checkout: string,
  env: NodeJS.ProcessEnv,
  timeout = TIMEOUT,
  expected: number | null = 0,
) {
  const result = await runBounded(executable, args, checkout, env, timeout)
  await writeFile(
    file,
    redact(
      `\n## ${phase}\n$ ${path.basename(executable)} ${args.join(' ')}\nexit=${result.code ?? 'null'} signal=${result.signal ?? 'none'}\n${result.stdout}\n${result.stderr}\n`,
    ),
    { flag: 'a' },
  )
  phases.push({
    phase,
    command: `${path.basename(executable)} ${args.join(' ')}`,
    status:
      (expected !== null && result.code === expected) ||
      (expected === null && result.code === 0)
        ? 'completed'
        : 'failed',
    code: result.code,
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

async function runScenario(
  options: Options,
  log: string,
  context: SnapshotContext,
) {
  if (options.scenario === 'bootstrap') {
    const bootstrap = (await readJourney(context.snapshot)).find(
      step => step.id === 'bootstrap',
    )
    if (!bootstrap) {
      throw new Error('README bootstrap step is missing.')
    }
    const args =
      bootstrap.command[0] === 'node'
        ? bootstrap.command.slice(1)
        : bootstrap.command
    await command(
      log,
      'literal README bootstrap journey',
      options.node,
      args,
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
  await runJourney(
    log,
    context.snapshot,
    options.node,
    context.env,
    command,
    startGuide,
    redact,
    recordGuideOutcome,
  )
}

async function runManagerScenario(
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
  const version = await command(
    log,
    `${managerName} exact version`,
    options.node,
    [manager, '--version'],
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
}

function recordGuideOutcome(outcome: GuideOutcome) {
  phases.push({
    phase: 'guide persistent server',
    command: outcome.command,
    status: 'completed',
    code: outcome.code,
  })
}

async function verifyFinalState(
  options: Options,
  log: string,
  context: SnapshotContext,
) {
  const finalManifests = await hashes(context.snapshot, [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
  ])
  if (JSON.stringify(context.manifests) !== JSON.stringify(finalManifests)) {
    throw new Error('Install changed package manifests or lockfiles.')
  }
  const sentinelsAfter = await hashes(
    path.join(path.dirname(context.snapshot), 'home'),
    Object.keys(context.sentinels),
  )
  if (JSON.stringify(context.sentinels) !== JSON.stringify(sentinelsAfter)) {
    throw new Error('Shell/global-config sentinel changed.')
  }
  const finalHead = run(
    context.gitExecutable,
    ['rev-parse', 'HEAD'],
    context.snapshot,
    context.env,
  ).stdout.trim()
  if (finalHead !== context.initialCommit) {
    throw new Error('Snapshot HEAD changed during onboarding.')
  }
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
}

async function main() {
  const options = parse(process.argv.slice(2))
  activeScenario = options.scenario
  await mkdir(LOG_ROOT, { recursive: true })
  const sandbox = await makeSandbox()
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
    REPO,
  )
  entryNodeVersion = context.nodeVersion
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

async function writeSummary(status: string, commit?: string, message?: string) {
  const summary = {
    scenario: activeScenario ?? 'unknown',
    status,
    entryNodeVersion: entryNodeVersion || null,
    managerVersions,
    commit: commit ?? null,
    message: message ? redact(message) : null,
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

async function execute() {
  try {
    await main()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const summary = await writeSummary('failed', undefined, message)
    if (activeLog) {
      await writeFile(
        activeLog,
        `\n## summary\nstatus=failed\nmessage=${redact(message)}\nphases=${JSON.stringify(phases)}\n`,
        { flag: 'a' },
      )
    }
    console.error(JSON.stringify({ ...summary, log: activeLog || null }))
    process.exitCode = 1
  } finally {
    if (!keepSandbox) {
      await cleanupSandbox?.()
    }
  }
}

void execute()
