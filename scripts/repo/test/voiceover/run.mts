import { createInterface } from 'node:readline'
import { stdin, stderr, stdout } from 'node:process'
import { isMainModule } from '../../lib/run-node.mts'
import { validateNarrationUrl } from './url.mts'

export interface RunOptions {
  platform?: NodeJS.Platform
  tty?: boolean
  input?: NodeJS.ReadStream
  output?: NodeJS.WriteStream
  confirm?: (message: string) => Promise<boolean>
  run?: (url: string, progress: (message: string) => void) => Promise<number>
  write?: (message: string) => void
  error?: (message: string) => void
}

const usage =
  'Usage: node scripts/repo/test/voiceover/run.mts [--start-session --url <local-api-page>]'

export async function main(
  args = process.argv.slice(2),
  options: RunOptions = {},
) {
  const write = options.write ?? console.log
  const error = options.error ?? console.error
  if (isStatusRequest(args)) {
    printStatus(write)
    return 0
  }
  if (isHelpRequest(args)) {
    write(`${usage}\nNo-argument status and help never start VoiceOver.`)
    return 0
  }
  const url = parseTarget(args, error)
  if (!url) {
    return 2
  }
  return runOptIn(url, options, write, error)
}

function isStatusRequest(args: string[]) {
  return args.length === 0
}

function isHelpRequest(args: string[]) {
  return args.length === 1 && ['--help', '-h'].includes(args[0]!)
}

function printStatus(write: (message: string) => void) {
  write('VoiceOver narration is opt-in. No session has started.')
  write('Start the local model guide, then run the explicit session command.')
  write(usage)
  write('The session uses one focused control on the local API reader page.')
  write('Stop with Ctrl+C. Command-F5 is the macOS emergency toggle.')
}

function parseTarget(args: string[], error: (message: string) => void) {
  if (
    args.length !== 3 ||
    args[0] !== '--start-session' ||
    args[1] !== '--url'
  ) {
    error(usage)
    return undefined
  }
  try {
    return validateNarrationUrl(args[2]!).toString()
  } catch (cause) {
    error(cause instanceof Error ? cause.message : String(cause))
    return undefined
  }
}

async function runOptIn(
  url: string,
  options: RunOptions,
  write: (message: string) => void,
  error: (message: string) => void,
) {
  if ((options.platform ?? process.platform) !== 'darwin') {
    error(
      'VoiceOver narration is available on macOS only. No action was taken.',
    )
    return 1
  }
  const input = options.input ?? stdin
  const output = options.output ?? stdout
  if (!(options.tty ?? (input.isTTY && output.isTTY))) {
    error(
      'Narration requires an interactive confirmation. No action was taken.',
    )
    return 2
  }
  const confirm =
    options.confirm ?? (message => askForConfirmation(input, output, message))
  if (!(await confirm(consentMessage))) {
    write(
      'Skipped VoiceOver narration. No settings or preferences were changed.',
    )
    return 0
  }
  const run =
    options.run ??
    (async (target, progress) => {
      const { runLiveNarration } = await import('./runtime.mts')
      return runLiveNarration(target, progress)
    })
  return run(url, message => stderr.write(`${message}\n`))
}

const consentMessage = [
  'This starts VoiceOver for one focused “Reading mode” control on the local API reader page.',
  'The test may speak aloud. It snapshots five VoiceOver preference entries and restores them only after VoiceOver is confirmed stopped and the temporary volume is detached.',
  'A temporary browser window opens. The active test is limited to 120s, then cleanup runs. Ctrl+C stops it. Privacy permissions are not changed.',
  'Start narration? [y/N] ',
].join('\n')

async function askForConfirmation(
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
  message: string,
) {
  const reader = createInterface({ input, output })
  output.write(message)
  return new Promise<boolean>(resolve => {
    let answered = false
    reader.once('line', line => {
      answered = true
      resolve(line.trim().toLowerCase() === 'y')
      reader.close()
    })
    reader.once('close', () => {
      if (!answered) {
        resolve(false)
      }
    })
  })
}

if (isMainModule(import.meta.url)) {
  process.exitCode = await main()
}
