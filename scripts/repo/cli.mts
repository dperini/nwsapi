import { parseArgs } from 'node:util'
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

export async function runCli(argv: string[]) {
  const [command, ...args] = argv
  if (!command || command === '--help' || command === '-h') {
    return `Usage: nwsapi <command> [options]

Commands:
  compile <selector>  Inspect a generated selector resolver
  jsdom <add|remove>  Manage this project's jsdom selector override

Options:
  --describe          Describe available commands
  --json              Format descriptions and results as JSON

Run nwsapi jsdom --help for jsdom integration details.
Run nwsapi compile --help for compiler options.`
  } else if (command === '--describe') {
    return args.includes('--json')
      ? JSON.stringify({
          schemaVersion: 1,
          type: 'commands',
          commands: COMMANDS,
        })
      : COMMANDS.map(item => `${item.name}: ${item.description}`).join('\n')
  } else if (command === '--json') {
    return JSON.stringify({
      schemaVersion: 1,
      type: 'commands',
      commands: COMMANDS,
    })
  } else if (command === 'jsdom') {
    return runJsdomCommand(args)
  } else if (command === 'compile') {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        mode: { type: 'string', short: 'm', default: 'select' },
        legacy: { type: 'boolean', default: false },
        json: { type: 'boolean', short: 'j', default: false },
        describe: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
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
    if (values.help) {
      return `Usage: nwsapi compile [options] <selector>

Options:
  -m, --mode <select|match|item>  Resolver mode (default: select)
      --legacy                  Compile for legacy DOM hosts
  -j, --json                    Include source metadata and helper bindings
  -h, --help                    Show this help

Use -- before a selector that starts with a dash.
Requires the optional jsdom peer dependency (pnpm add jsdom).
The resolver closes over engine Snapshot (s) and optional ancestor-filter state (a).
This is compiler inspection output, not a standalone querySelectorAll implementation.`
    } else {
      if (
        positionals.length !== 1 ||
        !['select', 'match', 'item'].includes(values.mode)
      ) {
        throw new Error(
          'Expected one selector and a valid mode. Run nwsapi compile --help.',
        )
      }
      return inspectSelector(positionals[0]!, values)
    }
  } else {
    throw new Error(
      `Unknown command ${JSON.stringify(command)}. Run nwsapi --help.`,
    )
  }
}
