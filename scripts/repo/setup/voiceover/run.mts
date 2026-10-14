import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { stdin, stdout } from 'node:process'
import { isMainModule } from '../../lib/run-node.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import { managedCommand, managedEnvironment } from '../manager.mts'
import type { ManagedResult } from '../manager.mts'
import { preflightVoiceOver } from './preflight.mts'
import type { VoiceOverPreflight } from './preflight.mts'

export type VoiceOverChoice = 'ask' | 'yes' | 'no'
export type VoiceOverRun = (
  args: string[],
  directory?: string,
) => ManagedResult | Promise<ManagedResult>

export interface VoiceOverOptions {
  choice?: VoiceOverChoice
  root?: string
  platform?: NodeJS.Platform
  tty?: boolean
  input?: NodeJS.ReadStream
  output?: NodeJS.WriteStream
  log?: (message: string) => void
  probe?: (root: string, platform?: NodeJS.Platform) => VoiceOverPreflight
  run?: VoiceOverRun
  openSettings?: (url: string) => ManagedResult
  ask?: (prompt: string) => Promise<string>
}

const settingsPrompt = [
  'Optional: prepare VoiceOver testing.',
  '1. Download verified testing assets into this checkout.',
  '2. Enable AppleScript control, hide the welcome splash, and disable Dictation auto-enable for this user.',
  '3. Open VoiceOver Utility if a manual setting is needed.',
  'These settings persist. Setup does not start narration or grant privacy permissions.',
  'Missing or unreadable VoiceOver preferences leave machine configuration for manual setup.',
  'Continue? [y/N] ',
].join('\n')

export async function setupVoiceOver(options: VoiceOverOptions = {}) {
  if (options.choice === 'no') {
    return { status: 0, signal: null }
  }
  const root = options.root ?? REPO_ROOT
  const log = options.log ?? console.log
  const probe =
    options.probe ??
    ((directory, platform) =>
      preflightVoiceOver({
        root: directory,
        ...(platform === undefined ? {} : { platform }),
      }))
  const state = probe(root, options.platform)
  if (!state.supported) {
    if (options.choice === 'yes') {
      log('VoiceOver setup is supported on macOS only.')
      return { status: 1, signal: null }
    }
    return { status: 0, signal: null }
  }
  if (state.machineSetup === 'ready' && state.assets === 'present') {
    log(
      'VoiceOver configuration and assets detected. Operating-system permissions remain unverified.',
    )
    return { status: 0, signal: null }
  }
  const choice = options.choice ?? 'ask'
  if (choice === 'ask' && !(await confirmVoiceOver(options))) {
    log(
      'Skipped optional VoiceOver setup. Run node scripts/repo/setup/voiceover/run.mts to retry.',
    )
    return { status: 0, signal: null }
  }
  return configureVoiceOver(state, root, options, log)
}

async function confirmVoiceOver(options: VoiceOverOptions) {
  const answer = await askQuestion(options, settingsPrompt)
  return answer?.trim().toLowerCase() === 'y'
}

async function askQuestion(options: VoiceOverOptions, question: string) {
  if (options.ask) {
    return options.ask(question)
  }
  const input = options.input ?? stdin
  const output = options.output ?? stdout
  if (!(options.tty ?? (input.isTTY && output.isTTY))) {
    return undefined
  }
  const prompt = createInterface({ input, output })
  const controller = new AbortController()
  prompt.once('close', () => controller.abort())
  try {
    return await prompt.question(question, { signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return undefined
    }
    throw error
  } finally {
    prompt.close()
  }
}

async function configureVoiceOver(
  state: VoiceOverPreflight,
  root: string,
  options: VoiceOverOptions,
  log: (message: string) => void,
) {
  const run = options.run ?? runGuidepup
  const directory = path.join(root, '.cache/guidepup')
  const installed = await run(
    ['exec', 'guidepup', 'install', 'voiceover'],
    directory,
  )
  if (!successful(installed)) {
    log(
      'Optional VoiceOver assets could not be installed. Retry with node scripts/repo/setup/voiceover/run.mts.',
    )
    return installed
  }
  if (state.machineSetup === 'unknown') {
    log(
      'VoiceOver assets are ready, but machine settings could not be read. Review permissions for your terminal application in System Settings, then retry with node scripts/repo/setup/voiceover/run.mts. Setup did not change machine settings.',
    )
    await offerSettingsPanel(options, log, 'privacy')
    return { status: 1, signal: null }
  }
  if (state.machineSetup === 'needed') {
    const probe =
      options.probe ??
      ((checkout, platform) =>
        preflightVoiceOver({
          root: checkout,
          ...(platform === undefined ? {} : { platform }),
        }))
    const current = probe(root, options.platform)
    if (current.localPreferences !== 'present') {
      log(
        'VoiceOver assets are ready, but local VoiceOver preferences are not confirmed. Automatic machine configuration was skipped to ensure setup never starts VoiceOver. Enable AppleScript control in VoiceOver Utility manually, then retry.',
      )
      await offerSettingsPanel(
        options,
        log,
        current.localPreferences === 'missing' ? 'utility' : 'privacy',
      )
      return { status: 1, signal: null }
    }
    if (current.machineSetup === 'unknown') {
      log(
        'VoiceOver assets are ready, but current-user settings could not be verified. No machine configuration was run.',
      )
      await offerSettingsPanel(options, log, 'privacy')
      return { status: 1, signal: null }
    }
    if (current.machineSetup === 'ready') {
      log(
        'VoiceOver settings are already configured. Permissions remain unverified.',
      )
      return { status: 0, signal: null }
    }
    log(
      'Configuring current-user VoiceOver settings. Follow the VoiceOver Utility instructions if it opens. Press Control-C to cancel; setup will not launch VoiceOver or narration.',
    )
    const configured = await run(
      ['exec', 'guidepup', 'setup', '--macos-ignore-tcc-db'],
      directory,
    )
    if (!successful(configured)) {
      log(
        'Optional VoiceOver setup did not finish. Enable “Allow VoiceOver to be controlled with AppleScript” in VoiceOver Utility, then retry with node scripts/repo/setup/voiceover/run.mts.',
      )
      await offerSettingsPanel(options, log, 'utility')
      return configured
    }
    const verified = probe(root, options.platform)
    if (verified.machineSetup !== 'ready') {
      log(
        'Guidepup finished its configuration step, but macOS settings could not be confirmed. VoiceOver was not started and privacy permissions remain unverified.',
      )
      await offerSettingsPanel(options, log, 'privacy')
      return { status: 1, signal: null }
    }
  }
  log(
    'Guidepup assets and configuration are available. Operating-system permissions are unverified; VoiceOver has not been started.',
  )
  return { status: 0, signal: null }
}

function successful(result: ManagedResult) {
  return result.status === 0 && !result.signal && !result.error
}

async function runGuidepup(
  args: string[],
  directory: string,
): Promise<ManagedResult> {
  const request = managedCommand(args)
  const env = managedEnvironment()
  env['GUIDEPUP_SCREEN_READERS_PATH'] = directory
  const child = spawn(request.command, request.args, {
    cwd: REPO_ROOT,
    env,
    detached: process.platform !== 'win32',
    stdio: 'inherit',
  })
  let timedOut = false
  let requestedSignal: NodeJS.Signals | null = null
  let escalation: ReturnType<typeof setTimeout> | undefined
  const kill = (signal: NodeJS.Signals) => {
    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, signal)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          throw error
        }
      }
      return
    }
    child.kill(signal)
  }
  const stop = (signal: NodeJS.Signals) => {
    requestedSignal = signal
    kill(signal)
    escalation ??= setTimeout(() => kill('SIGKILL'), 5000)
    escalation.unref()
  }
  const onInterrupt = () => stop('SIGINT')
  const onTerminate = () => stop('SIGTERM')
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  const timeout = setTimeout(
    () => {
      timedOut = true
      stop('SIGTERM')
    },
    args.includes('setup') ? 300_000 : 900_000,
  )
  try {
    const result = await new Promise<{
      code: number | null
      signal: NodeJS.Signals | null
    }>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    if (requestedSignal && process.platform !== 'win32') {
      kill('SIGKILL')
    }
    return timedOut
      ? {
          status: null,
          signal: result.signal,
          error: new Error('Guidepup command exceeded its time limit.'),
        }
      : { status: result.code, signal: requestedSignal ?? result.signal }
  } catch (error) {
    return {
      status: null,
      signal: null,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  } finally {
    clearTimeout(timeout)
    clearTimeout(escalation)
    process.removeListener('SIGINT', onInterrupt)
    process.removeListener('SIGTERM', onTerminate)
  }
}

async function offerSettingsPanel(
  options: VoiceOverOptions,
  log: (message: string) => void,
  destination: 'utility' | 'privacy',
) {
  const input = options.input ?? stdin
  const output = options.output ?? stdout
  if (!(options.tty ?? (input.isTTY && output.isTTY))) {
    return
  }
  const { question, target } = settingsDestinations[destination]
  if ((await askQuestion(options, question))?.trim().toLowerCase() !== 'y') {
    return
  }
  const result = options.openSettings
    ? options.openSettings(target)
    : spawnSync('/usr/bin/open', [target], {
        stdio: 'inherit',
        timeout: 10_000,
      })
  if (result.status !== 0 || result.error) {
    log(
      `Could not open settings: ${result.error?.message ?? `exit ${result.status ?? 'unknown'}`}. Open the window manually to continue.`,
    )
  }
}

const settingsDestinations = {
  utility: {
    question: 'Open VoiceOver Utility to review AppleScript control? [y/N] ',
    target: '/System/Applications/Utilities/VoiceOver Utility.app',
  },
  privacy: {
    question:
      'Open macOS Privacy & Security to review your terminal application permissions? [y/N] ',
    target: 'x-apple.systempreferences:com.apple.preference.security',
  },
}

export async function main(
  args: string[] = [],
  options: VoiceOverOptions = {},
) {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: 'boolean', short: 'h' },
      yes: { type: 'boolean' },
    },
  })
  if (values.help) {
    ;(options.log ?? console.log)(
      'Usage: node scripts/repo/setup/voiceover/run.mts [--yes]\nRetries optional VoiceOver assets and settings only. Core setup is not rerun.\nSettings persist. Narration is never started. Interactive confirmation defaults to skip.\n--yes explicitly opts in, including without a terminal.',
    )
    return { status: 0, signal: null }
  }
  return setupVoiceOver({ choice: values.yes ? 'yes' : 'ask', ...options })
}

if (isMainModule(import.meta.url)) {
  const result = await main(process.argv.slice(2))
  process.exitCode = result.signal ? 130 : (result.status ?? 1)
}
