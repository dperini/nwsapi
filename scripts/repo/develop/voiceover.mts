import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { isMainModule } from '../lib/run-node.mts'
import { controlVoiceOver, voiceOverState } from './voiceover/control.mts'

export async function main(args = process.argv.slice(2)) {
  if (process.platform !== 'darwin') {
    console.log('VoiceOver controls are available on macOS only.')
    return 1
  }
  if (
    args.length > 1 ||
    args.some(arg => !['--start', '--stop'].includes(arg))
  ) {
    console.error(
      'Usage: node scripts/repo/develop/voiceover.mts [--start|--stop]',
    )
    return 2
  }
  if (args.includes('--start') && args.includes('--stop')) {
    console.error('Choose only one of --start or --stop.')
    return 2
  }
  const requested = args.includes('--start')
    ? 'start'
    : args.includes('--stop')
      ? 'stop'
      : await chooseAction()
  if (!requested) {
    return 0
  }
  const result = await controlVoiceOver(requested)
  console.log(result.message)
  return result.status
}

export async function chooseAction() {
  if (!stdin.isTTY || !stdout.isTTY) {
    console.log(
      `VoiceOver is ${voiceOverState()}. Use --start or --stop for an explicit action. Command-F5 is the macOS emergency toggle.`,
    )
    return undefined
  }
  const state = voiceOverState()
  if (state === 'unknown') {
    console.log(
      'VoiceOver state could not be determined. No action was taken. Command-F5 is the macOS emergency toggle.',
    )
    return undefined
  }
  console.log(
    `VoiceOver is ${state}. Command-F5 is the macOS emergency toggle.`,
  )
  const action = state === 'running' ? 'stop' : 'start'
  const label = action === 'start' ? 'Start VoiceOver' : 'Stop VoiceOver'
  const reader = createInterface({ input: stdin, output: stdout })
  const controller = new AbortController()
  reader.once('close', () => controller.abort())
  try {
    const answer = (
      await reader.question(`${label}? [y/N] `, {
        signal: controller.signal,
      })
    )
      .trim()
      .toLowerCase()
    return answer === 'y' ? action : undefined
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return undefined
    }
    throw error
  } finally {
    reader.close()
  }
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main()
}
