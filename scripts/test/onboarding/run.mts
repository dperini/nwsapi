import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO_ROOT, isMainModule } from '../../lib/paths.mts'
import { installTool } from '../../lib/tools/install.mjs'
import {
  toolExecutable,
  toolPlan,
  toolVersion,
} from '../../lib/external-tools.mjs'
import type { JourneyStep } from './readme.mts'
import { readJourney } from './readme.mts'
import { runBounded } from './process.mts'
import { runPlainSetup } from './terminal.mts'

export interface PhaseResult {
  phase: string
  command: string
  status: 'completed' | 'failed' | 'skipped'
  code: number | null
  durationMs: number
}

export interface OnboardingSummary {
  scenario: string
  status: 'completed' | 'failed'
  commit: string
  entryNodeVersion: string
  phases: PhaseResult[]
  coreReady?: { node: string; npm: string }
  message?: string
}

export function immutableInputs(root: string) {
  return Object.fromEntries(
    [
      'package.json',
      'package-lock.json',
      '.npmrc',
      '.config/external-tools.json',
    ].map(file => {
      const target = path.join(root, file)
      const exists = existsSync(target)
      const hash = createHash('sha256').update(
        exists ? 'present\0' : 'absent\0',
      )
      if (exists) {
        hash.update(readFileSync(target))
      }
      return [file, hash.digest('hex')]
    }),
  )
}

export function assertUnchanged(
  before: Record<string, string>,
  after: Record<string, string>,
) {
  for (const name of Object.keys(before)) {
    if (before[name] !== after[name]) {
      throw new Error(
        'Onboarding changed a repository pin or lockfile: ' + name,
      )
    }
  }
}

export function failureSummary(output: string) {
  const failures = output
    .split(/\r?\n/)
    .filter(line => /^\s*not ok \d+ - /.test(line))
  return failures.length
    ? failures
        .slice(0, 5)
        .map(line => line.trim())
        .join('\n')
    : output.slice(-2000)
}

export function cleanEnvironment(parent = process.env, home: string) {
  const env: NodeJS.ProcessEnv = {
    ...parent,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    XDG_DATA_HOME: path.join(home, '.local/share'),
    APPDATA: path.join(home, 'AppData/Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData/Local'),
    TMPDIR: path.join(home, 'tmp'),
    TMP: path.join(home, 'tmp'),
    TEMP: path.join(home, 'tmp'),
    NPM_CONFIG_USERCONFIG: path.join(home, '.npmrc'),
    NPM_CONFIG_GLOBALCONFIG: path.join(home, 'global.npmrc'),
    GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'),
    GIT_TERMINAL_PROMPT: '0',
  }
  const pathKey = Object.keys(parent).find(
    name => name.toLowerCase() === 'path',
  )
  env.PATH = pathKey ? parent[pathKey] : ''
  for (const name of Object.keys(env)) {
    if (name.toLowerCase() === 'path' && name !== 'PATH') {
      delete env[name]
      continue
    }
    if (
      (/^npm_/i.test(name) &&
        !/^NPM_CONFIG_(USERCONFIG|GLOBALCONFIG)$/i.test(name)) ||
      /^(NODE_OPTIONS|NODE_PATH|NODE_AUTH_TOKEN|NPM_TOKEN|GITHUB_TOKEN|GH_TOKEN)$/.test(
        name,
      )
    ) {
      delete env[name]
    }
  }
  return env
}

export type RunPhase = (
  label: string,
  command: string,
  args: string[],
  cwd?: string,
) => Promise<string>

export function readmeCommand(
  steps: JourneyStep[],
  id: string,
  executable: string,
) {
  const command = steps.find(step => step.id === id)?.command
  if (!command || command[0] !== executable) {
    throw new Error('Missing or invalid README onboarding command: ' + id)
  }
  return command
}

export function nextCommandArgs(output: string, label: string) {
  const line = output
    .split(/\r?\n/)
    .find(candidate => candidate.includes(label))
  const command = line?.slice(line.indexOf(label) + label.length).trim()
  if (!command) {
    throw new Error('Missing printed next command: ' + label)
  }
  const [executable, ...args] = command.split(/\s+/)
  if (executable !== 'node' || args.length === 0) {
    throw new Error('Next command must use the direct Node entry point.')
  }
  return args
}

export async function runEntry(
  scenario: string,
  steps: JourneyStep[],
  phase: RunPhase,
  install = () => installTool(toolPlan('npm')),
) {
  if (scenario === 'bootstrap') {
    const command = readmeCommand(steps, 'bootstrap', 'node')
    return phase('README bootstrap', process.execPath, command.slice(1))
  } else {
    const cli = await install()
    const version = await phase('Pinned npm entry version', process.execPath, [
      cli,
      '--version',
    ])
    if (version.trim() !== toolVersion('npm')) {
      throw new Error('Entry npm differs from its pin.')
    }
    const command = readmeCommand(steps, 'install', 'npm')
    await phase('README npm install', process.execPath, [
      cli,
      ...command.slice(1),
    ])
    return ''
  }
}

export async function verifyReadme(
  steps: JourneyStep[],
  node: string,
  phase: RunPhase,
) {
  for (const id of ['discovery', 'readiness']) {
    const command = readmeCommand(steps, id, 'node')
    const result = JSON.parse(
      await phase('README ' + id, node, command.slice(1)),
    )
    if (
      id === 'discovery'
        ? result.type !== 'tasks'
        : result.status !== 'completed'
    ) {
      throw new Error('Unexpected README ' + id + ' result.')
    }
  }
}

export async function verifyWizard(
  checkout: string,
  node: string,
  env: NodeJS.ProcessEnv,
  log: (chunk: string) => void,
): Promise<PhaseResult> {
  if (process.platform === 'linux') {
    const terminal = await runPlainSetup({
      checkout,
      node,
      env,
      timeoutMs: 20 * 60_000,
      log,
    })
    if (
      terminal.code !== 0 ||
      terminal.failure ||
      !terminal.previewObserved ||
      !terminal.confirmationSent ||
      !terminal.setupCompleted
    ) {
      throw new Error(
        'Setup wizard: ' +
          (terminal.failure ??
            failureSummary(terminal.stdout + terminal.stderr)),
      )
    }
    return {
      phase: 'Plain terminal setup wizard',
      command: 'node scripts/develop/run.mts --plain',
      status: 'completed',
      code: 0,
      durationMs: 0,
    }
  } else {
    return {
      phase: 'Plain terminal setup wizard',
      command: 'PTY journey requires Linux script utility',
      status: 'skipped',
      code: null,
      durationMs: 0,
    }
  }
}

export async function verifyTasks(
  node: string,
  runner: string,
  phase: RunPhase,
) {
  for (const id of ['setup', 'setup:check', 'docs', 'review']) {
    const result = JSON.parse(
      await phase('Guided ' + id, node, [runner, '--task', id, '--json']),
    )
    if (result.status !== 'completed') {
      throw new Error('Guided task failed: ' + id)
    }
  }
}

export async function verifyPrintedNext(
  output: string,
  label: string,
  node: string,
  phase: RunPhase,
) {
  const args = nextCommandArgs(output, label)
  await phase('Printed next command', node, args)
}

export function blockExternalManagers(
  temporary: string,
  env: NodeJS.ProcessEnv,
) {
  const blocked = path.join(temporary, 'blocked-managers')
  mkdirSync(blocked)
  const windows = process.platform === 'win32'
  for (const name of ['npm', 'pnpm']) {
    writeFileSync(
      path.join(blocked, name + (windows ? '.cmd' : '')),
      windows
        ? '@echo off\r\necho ONBOARDING_EXTERNAL_NPM_BLOCKED\r\nexit /b 125\r\n'
        : '#!/bin/sh\nprintf "%s\\n" ONBOARDING_EXTERNAL_NPM_BLOCKED\nexit 125\n',
      { mode: 0o755 },
    )
  }
  env.PATH = blocked + path.delimiter + env.PATH
  return path.join(blocked, windows ? 'npm.cmd' : 'npm')
}

export function blockedManagerCommand(env: NodeJS.ProcessEnv) {
  return process.platform === 'win32'
    ? {
        command: env['ComSpec'] ?? 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm --version'],
      }
    : { command: 'npm', args: ['--version'] }
}

interface OnboardingContext {
  scenario: string
  source: string
  commit: string
  temporary: string
  checkout: string
  home: string
  evidence: string
  env: NodeJS.ProcessEnv
  logFile: string
  summary: OnboardingSummary
  output: string
}

type OnboardingPhase = (
  label: string,
  command: string,
  args: string[],
  cwd?: string,
  expected?: number,
) => Promise<string>

function validateScenario(scenario: string) {
  if (!['bootstrap', 'journey'].includes(scenario)) {
    throw new Error('Choose bootstrap or journey.')
  }
}

function createContext(scenario: string, source: string): OnboardingContext {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: source,
    encoding: 'utf8',
  }).trim()
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-v2-onboarding-'))
  const checkout = path.join(temporary, 'checkout')
  const home = path.join(temporary, 'home')
  const evidence = path.join(source, '.cache', 'onboarding')
  mkdirSync(home)
  mkdirSync(path.join(home, 'tmp'))
  mkdirSync(evidence, { recursive: true })
  const env = cleanEnvironment(process.env, home)
  env.PATH = path.dirname(process.execPath) + path.delimiter + (env.PATH ?? '')
  const logFile = path.join(evidence, scenario + '-' + Date.now() + '.log')
  const summary: OnboardingSummary = {
    scenario,
    status: 'failed',
    commit,
    entryNodeVersion: process.version,
    phases: [],
  }
  return {
    scenario,
    source,
    commit,
    temporary,
    checkout,
    home,
    evidence,
    env,
    logFile,
    summary,
    output: '',
  }
}

function createPhaseRunner(context: OnboardingContext): OnboardingPhase {
  return async (
    label: string,
    command: string,
    args: string[],
    cwd = context.checkout,
    expected = 0,
  ) => {
    console.log('[onboarding] ' + label)
    const started = performance.now()
    const result = await runBounded(
      command,
      args,
      cwd,
      context.env,
      20 * 60_000,
    )
    const durationMs = Math.round(performance.now() - started)
    context.output += '\n### ' + label + '\n' + result.stdout + result.stderr
    writeFileSync(context.logFile, context.output)
    context.summary.phases.push({
      phase: label,
      command: [path.basename(command), ...args].join(' '),
      status:
        result.code === expected && !result.error ? 'completed' : 'failed',
      code: result.code,
      durationMs,
    })
    if (result.code !== expected || result.error) {
      throw new Error(
        label +
          ': ' +
          (result.error?.message ??
            failureSummary(result.stdout + result.stderr)),
      )
    }
    return result.stdout
  }
}

async function prepareFreshCheckout(
  context: OnboardingContext,
  phase: OnboardingPhase,
) {
  await phase(
    'Independent checkout',
    'git',
    ['clone', '--no-local', '--no-checkout', context.source, context.checkout],
    context.temporary,
  )
  await phase('Exact source commit', 'git', [
    'checkout',
    '--detach',
    context.commit,
  ])
  if (
    existsSync(path.join(context.checkout, 'node_modules')) ||
    existsSync(path.join(context.checkout, '.cache'))
  ) {
    throw new Error('Fresh checkout contained installed tools or dependencies.')
  }
}

async function verifyBlockedManager(
  context: OnboardingContext,
  phase: OnboardingPhase,
  label: string,
) {
  const probe = blockedManagerCommand(context.env)
  const output = await phase(
    label,
    probe.command,
    probe.args,
    context.checkout,
    125,
  )
  if (!output.includes('ONBOARDING_EXTERNAL_NPM_BLOCKED')) {
    throw new Error('External npm did not resolve to the blocked sentinel.')
  }
}

async function runBootstrapFlow(
  context: OnboardingContext,
  steps: JourneyStep[],
  phase: OnboardingPhase,
) {
  const blockedNpm =
    context.scenario === 'bootstrap'
      ? blockExternalManagers(context.temporary, context.env)
      : undefined
  if (blockedNpm) {
    await verifyBlockedManager(context, phase, 'Unavailable external npm')
  }
  const before = immutableInputs(context.checkout)
  const bootstrapOutput = await runEntry(context.scenario, steps, phase)
  if (blockedNpm) {
    await verifyBlockedManager(
      context,
      phase,
      'Unavailable external npm after bootstrap',
    )
    await verifyPrintedNext(bootstrapOutput, 'Next: ', process.execPath, phase)
  }
  return before
}

async function runJourney(
  context: OnboardingContext,
  steps: JourneyStep[],
  node: string,
  phase: OnboardingPhase,
) {
  if (context.scenario !== 'journey') {
    return
  }
  const doctorOutput = await phase('README doctor next command', node, [
    'scripts/develop/doctor.mts',
  ])
  await verifyPrintedNext(doctorOutput, 'Next command: ', node, phase)
  const wizardStarted = performance.now()
  const wizard = await verifyWizard(
    context.checkout,
    node,
    context.env,
    chunk => {
      context.output += chunk
    },
  )
  wizard.durationMs = Math.round(performance.now() - wizardStarted)
  context.summary.phases.push(wizard)
  writeFileSync(context.logFile, context.output)
  await verifyTasks(
    node,
    path.join(context.checkout, 'scripts/develop/run.mts'),
    phase,
  )
}

async function verifyPinnedTools(
  context: OnboardingContext,
  node: string,
  phase: OnboardingPhase,
) {
  const npmVersion = (
    await phase('Pinned npm stays selected', node, [
      path.join(
        context.checkout,
        path.relative(context.source, toolExecutable('npm')),
      ),
      '--version',
    ])
  ).trim()
  const nodeVersion = (
    await phase('Pinned Node stays selected', node, ['--version'])
  )
    .trim()
    .replace(/^v/, '')
  if (nodeVersion !== toolVersion('node')) {
    throw new Error('Checkout Node differs from its pin.')
  }
  if (npmVersion !== toolVersion('npm')) {
    throw new Error('Checkout npm differs from its pin.')
  }
  context.summary.coreReady = { node: nodeVersion, npm: npmVersion }
  console.log(
    `[onboarding] Core checkout ready with pinned Node ${nodeVersion} and npm ${npmVersion}.`,
  )
}

function recordFailure(context: OnboardingContext, error: unknown) {
  context.summary.message =
    error instanceof Error ? error.message : String(error)
  console.error(
    '[onboarding] Failed: ' +
      context.summary.message +
      '\nFull evidence: ' +
      context.logFile +
      '\nRetry: node scripts/test/onboarding/run.mts ' +
      context.scenario,
  )
}

function saveSummary(context: OnboardingContext) {
  writeFileSync(
    context.logFile + '.summary.json',
    JSON.stringify(context.summary, null, 2) + '\n',
  )
  rmSync(context.temporary, { recursive: true, force: true })
}

export async function runOnboarding(scenario = 'journey', source = REPO_ROOT) {
  validateScenario(scenario)
  const context = createContext(scenario, source)
  const phase = createPhaseRunner(context)
  try {
    await prepareFreshCheckout(context, phase)
    const steps = await readJourney(context.checkout)
    const before = await runBootstrapFlow(context, steps, phase)
    const node = path.join(
      context.checkout,
      '.cache/bin',
      process.platform === 'win32' ? 'node.exe' : 'node',
    )
    await verifyReadme(steps, node, phase)
    await runJourney(context, steps, node, phase)
    await verifyPinnedTools(context, node, phase)
    assertUnchanged(before, immutableInputs(context.checkout))
    context.summary.status = 'completed'
  } catch (error) {
    recordFailure(context, error)
  } finally {
    saveSummary(context)
  }
  return context.summary
}

if (isMainModule(import.meta.url)) {
  const summary = await runOnboarding(process.argv[2])
  console.log(JSON.stringify(summary))
  process.exitCode = summary.status === 'completed' ? 0 : 1
}
