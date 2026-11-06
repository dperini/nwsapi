import { object } from '@optique/core/constructs'
import { optional, withDefault } from '@optique/core/modifiers'
import { argument, flag } from '@optique/core/primitives'
import { HELP_SHOWN, runCli } from '../lib/cli/parser.mts'
import { string } from '@optique/core/valueparser'

export const RUN_HELP = `Usage: node scripts/repo/run.mts <entry> [arguments]

Runs a repository script with the repository root as its working directory.
Arguments after <entry> are forwarded unchanged. Node entries use the current
Node executable and the repository compile cache.

Examples:
  node scripts/repo/run.mts scripts/repo/test.mts --help
  node scripts/repo/run.mts scripts/repo/test.mts unit --reporter=verbose

-h, --help  Show runner help. Put help after <entry> to show that script's help.`

const entryParser = object({ entry: optional(argument(string())) })
const controlsParser = object({
  json: withDefault(flag('--json'), false),
  describe: withDefault(flag('--describe'), false),
  dryRun: withDefault(flag('--dry-run'), false),
})

export function parseRunArgs(args: string[]) {
  if (args[0] === '--help' || args[0] === '-h') {
    if (args.length > 1) {
      throw new Error('Runner help does not accept positional arguments.')
    }
    return { help: true as const }
  }
  const parsedEntry = runCli(entryParser, 'nwsapi-run', args.slice(0, 1))
  if (parsedEntry === HELP_SHOWN) {
    return { help: true as const }
  }
  const { entry } = parsedEntry
  if (!entry) {
    throw new Error('Missing <entry>. Run with --help for usage and examples.')
  }
  if (entry.startsWith('-')) {
    throw new Error(
      `Expected <entry> before ${JSON.stringify(entry)}. Put runner flags after the entry to forward them.`,
    )
  }
  const controlArgs: string[] = []
  const forwarded: string[] = []
  let endOfOptions = false
  for (const arg of args.slice(1)) {
    if (!endOfOptions && arg === '--') {
      endOfOptions = true
      forwarded.push(arg)
    } else if (
      !endOfOptions &&
      ['--json', '--describe', '--dry-run'].includes(arg)
    ) {
      controlArgs.push(arg)
    } else {
      forwarded.push(arg)
    }
  }
  const values = runCli(controlsParser, 'nwsapi-run', controlArgs)
  if (values === HELP_SHOWN) {
    return { help: true as const }
  }
  if (values.describe && values.dryRun) {
    throw new Error('Choose --describe or --dry-run.')
  }
  return {
    args: [...forwarded],
    entry,
    help: false as const,
    json: values.json,
    describe: values.describe,
    dryRun: values.dryRun,
  }
}
