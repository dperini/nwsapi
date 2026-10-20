import { spawnSync } from 'node:child_process'

export type VoiceOverState = 'running' | 'stopped' | 'unknown'
export type VoiceOverAction = 'start' | 'stop'
export type CommandResult = {
  status: number | null
  error?: Error | undefined
}
export type VoiceOverCommand = (
  command: string,
  args: string[],
) => CommandResult
export type Delay = (milliseconds: number) => Promise<void>

const STATE_INTERVAL_MS = 250
const STATE_TIMEOUT_MS = 5000

export function voiceOverState(
  run: VoiceOverCommand = runCommand,
  platform = process.platform,
  uid: number | null | undefined = process.getuid?.(),
): VoiceOverState {
  if (platform !== 'darwin') {
    return 'unknown'
  }
  if (uid === undefined || uid === null) {
    return 'unknown'
  }
  const result = run('/usr/bin/pgrep', ['-U', String(uid), '-x', 'VoiceOver'])
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    return 'unknown'
  }
  return result.status === 0 ? 'running' : 'stopped'
}

export async function controlVoiceOver(
  action: VoiceOverAction,
  state: VoiceOverState = voiceOverState(),
  run: VoiceOverCommand = runCommand,
  platform = process.platform,
  delay: Delay = wait,
  uid: number | null | undefined = process.getuid?.(),
  now: () => number = () => performance.now(),
) {
  const unavailable = unavailableMessage(state, platform)
  if (unavailable) {
    return unavailable
  }
  const unchanged = unchangedMessage(action, state)
  if (unchanged) {
    return { status: 0, message: unchanged }
  }
  const result = runAction(action, run)
  if (result.status !== 0 || result.error) {
    return commandFailure(action)
  }
  const expected = action === 'start' ? 'running' : 'stopped'
  const confirmed = await waitForState(expected, run, platform, delay, uid, now)
  if (!confirmed) {
    return {
      status: 1,
      message: `VoiceOver did not confirm the ${expected} state within 5s. Command-F5 is the macOS emergency toggle.`,
    }
  }
  return {
    status: 0,
    message: successMessage(action),
  }
}

export function runAction(action: VoiceOverAction, run: VoiceOverCommand) {
  return action === 'start' ? startVoiceOver(run) : stopVoiceOver(run)
}

export function successMessage(action: VoiceOverAction) {
  return action === 'start' ? 'VoiceOver started.' : 'VoiceOver stopped.'
}

export function unavailableMessage(
  state: VoiceOverState,
  platform: NodeJS.Platform,
) {
  if (platform !== 'darwin') {
    return {
      status: 1,
      message: 'VoiceOver controls are available on macOS only.',
    }
  }
  if (state === 'unknown') {
    return {
      status: 1,
      message: 'VoiceOver state could not be determined. No action was taken.',
    }
  }
  return undefined
}

export function unchangedMessage(
  action: VoiceOverAction,
  state: VoiceOverState,
) {
  if (action === 'start' && state === 'running') {
    return 'VoiceOver is already running.'
  }
  if (action === 'stop' && state === 'stopped') {
    return 'VoiceOver is already stopped.'
  }
  return undefined
}

export async function waitForState(
  expected: VoiceOverState,
  run: VoiceOverCommand,
  platform: NodeJS.Platform,
  delay: Delay,
  uid: number | null | undefined,
  now: () => number,
) {
  const deadline = now() + STATE_TIMEOUT_MS
  while (now() < deadline) {
    if (voiceOverState(run, platform, uid) === expected) {
      return true
    }
    const remaining = deadline - now()
    await delay(Math.min(STATE_INTERVAL_MS, Math.max(remaining, 0)))
  }
  return false
}

export function commandFailure(action: VoiceOverAction) {
  const instruction =
    action === 'stop' ? ' Command-F5 is the macOS emergency toggle.' : ''
  return {
    status: 1,
    message: `${action === 'start' ? 'Could not start' : 'Could not stop'} VoiceOver.${instruction}`,
  }
}

export function startVoiceOver(run: VoiceOverCommand) {
  return run('/usr/bin/open', [
    '-a',
    '/System/Library/CoreServices/VoiceOver.app',
  ])
}

export function stopVoiceOver(run: VoiceOverCommand) {
  return run('/usr/bin/osascript', [
    '-e',
    'if application "VoiceOver" is running then tell application "VoiceOver" to quit',
  ])
}

export function runCommand(command: string, args: string[]): CommandResult {
  const probe = command === '/usr/bin/pgrep'
  const result = spawnSync(command, args, {
    stdio: probe ? 'ignore' : 'inherit',
    timeout: probe ? 500 : 10_000,
    killSignal: 'SIGKILL',
  })
  return { status: result.status, error: result.error }
}

export function wait(milliseconds: number) {
  return new Promise<void>(resolve => setTimeout(resolve, milliseconds))
}
