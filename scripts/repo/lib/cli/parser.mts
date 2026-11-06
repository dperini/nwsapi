import type { RunOptions } from '@optique/core/facade'
import { runParserSync } from '@optique/core/facade'
import { object } from '@optique/core/constructs'
import type { Message } from '@optique/core/message'
import { withDefault } from '@optique/core/modifiers'
import { flag, passThrough } from '@optique/core/primitives'
import type { InferValue, Parser } from '@optique/core/parser'

export const HELP_SHOWN: unique symbol = Symbol('Optique help shown')

type CliOptions = Omit<RunOptions<typeof HELP_SHOWN, never>, 'help'>

const setupParser = object({
  json: withDefault(flag('--json'), false),
  describe: withDefault(flag('--describe'), false),
  dryRun: withDefault(flag('--dry-run'), false),
})
const checkParser = object({ check: withDefault(flag('--check'), false) })

export function runCli<TParser extends Parser>(
  parser: TParser,
  programName: string,
  args: readonly string[],
  options: CliOptions = {},
): InferValue<TParser> | typeof HELP_SHOWN {
  return runParserSync(parser, programName, args, {
    ...options,
    help: {
      option: { names: ['-h', '--help'] },
      onShow: () => HELP_SHOWN,
    },
    completion: { option: true },
  }) as InferValue<TParser> | typeof HELP_SHOWN
}

export function runHelpOnlyCli(
  programName: string,
  args: readonly string[],
  brief: Message,
) {
  return runCli(object({}), programName, args, { brief }) === HELP_SHOWN
}

export function runForwardingCli(
  programName: string,
  args: readonly string[],
  brief: Message,
): { forwardedArgs: string[] } | typeof HELP_SHOWN {
  if (args.some(argument => argument === '--help' || argument === '-h')) {
    return runCli(object({}), programName, args, { brief }) as typeof HELP_SHOWN
  }
  return runCli(
    object({ forwardedArgs: passThrough({ format: 'greedy' }) }),
    programName,
    args,
    { brief },
  ) as { forwardedArgs: string[] }
}

export function runSetupCli(
  programName: string,
  args: readonly string[],
  brief: Message,
) {
  return runCli(setupParser, programName, args, { brief })
}

export function runCheckCli(
  programName: string,
  args: readonly string[],
  brief: Message,
) {
  return runCli(checkParser, programName, args, { brief })
}
