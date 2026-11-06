import { object } from '@optique/core/constructs'
import { message } from '@optique/core/message'
import { optional, withDefault } from '@optique/core/modifiers'
import { argument, flag, option, passThrough } from '@optique/core/primitives'
import { choice, string } from '@optique/core/valueparser'
import { HELP_SHOWN, runCli as runOptiqueCli } from './lib/cli/parser.mts'
import { inspectSelector } from './compile.mts'
import { runJsdomCommand } from './cli/jsdom.mts'

export const COMMANDS = [
  {
    name: 'compile',
    description: 'Inspect a generated selector resolver.',
    mutates: false,
  },
  {
    name: 'jsdom',
    description: "Manage this project's jsdom selector override.",
    mutates: true,
  },
] as const

const ROOT_USAGE = `Usage: nwsapi <command> [options]\n\nCommands:\n  compile <selector>  Inspect a generated selector resolver\n  jsdom <add|remove>  Manage this project's jsdom selector override\n\nOptions:\n  --describe          Describe available commands\n  --json              Format descriptions and results as JSON\n\nRun nwsapi jsdom --help for jsdom integration details.\nRun nwsapi compile --help for compiler options.`

export async function runCli(argv: string[]) {
  if (
    argv.some(cliArg => cliArg === '-h' || cliArg === '--help') &&
    !['compile', 'jsdom'].includes(argv[0]!)
  ) {
    return ROOT_USAGE
  }
  let helpOutput = ''
  const help = runOptiqueCli(
    object({
      command: optional(argument(choice(['compile', 'jsdom']))),
      forwardedArgs: passThrough({ format: 'greedy' }),
      describe: withDefault(flag('--describe'), false),
      json: withDefault(flag('--json'), false),
    }),
    'nwsapi',
    argv,
    {
      brief: message`Inspect selector compilation or manage this project's jsdom integration.`,
      footer: message`Run nwsapi jsdom --help for jsdom integration details. Run nwsapi compile --help for compiler options.`,
      stdout: text => {
        helpOutput += text
      },
    },
  )
  if (help === HELP_SHOWN) {
    return helpOutput
  }
  if (help.describe) {
    return help.json
      ? JSON.stringify({
          schemaVersion: 1,
          type: 'commands',
          commands: COMMANDS,
        })
      : COMMANDS.map(item => `${item.name}: ${item.description}`).join('\n')
  }
  if (!help.command) {
    return ROOT_USAGE
  }
  const forwardedArgs = [
    ...help.forwardedArgs,
    ...(help.json ? ['--json'] : []),
    ...(help.describe ? ['--describe'] : []),
  ]
  if (help.command === 'jsdom') {
    return runJsdomCommand(forwardedArgs)
  }
  let compileHelpOutput = ''
  const values = runOptiqueCli(
    object({
      mode: withDefault(
        option('-m', '--mode', choice(['select', 'match', 'item'])),
        'select',
      ),
      legacy: withDefault(flag('--legacy'), false),
      json: withDefault(flag('-j', '--json'), false),
      describe: withDefault(flag('--describe'), false),
      selector: optional(argument(string())),
    }),
    'nwsapi compile',
    forwardedArgs,
    {
      brief: message`Inspect a generated selector resolver.`,
      footer: message`Use -- before a selector that starts with a dash. Requires the optional jsdom peer dependency. The resolver closes over engine Snapshot (s) and optional ancestor-filter state (a).`,
      stdout: text => {
        compileHelpOutput += text
      },
    },
  )
  if (values === HELP_SHOWN) {
    return compileHelpOutput
  }
  if (values.describe) {
    const description = {
      schemaVersion: 1,
      type: 'command',
      name: 'compile',
      description: COMMANDS[0].description,
      mutates: false,
      options: ['--mode', '--legacy', '--json'],
    }
    return values.json
      ? JSON.stringify(description)
      : `${description.name}: ${description.description}\nRead-only. Use --help for options.`
  }
  if (!values.selector) {
    throw new Error('Expected one selector. Run nwsapi compile --help.')
  }
  return inspectSelector(values.selector, {
    mode: values.mode,
    legacy: values.legacy,
    json: values.json,
  })
}
