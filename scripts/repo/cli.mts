import { parseArgs } from 'node:util'
import { inspectSelector } from './compile.mts'

export async function runCli(argv: string[]) {
  const [command, ...args] = argv
  if (!command || command === '--help' || command === '-h') {
    return `Usage: nwsapi <command> [options]

Commands:
  compile <selector>  Inspect a generated selector resolver

Run nwsapi compile --help for compiler options.`
  } else if (command === 'compile') {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      options: {
        mode: { type: 'string', short: 'm', default: 'select' },
        legacy: { type: 'boolean', default: false },
        json: { type: 'boolean', short: 'j', default: false },
        help: { type: 'boolean', short: 'h' },
      },
    })
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
      return inspectSelector(positionals[0], values)
    }
  } else {
    throw new Error(
      `Unknown command ${JSON.stringify(command)}. Run nwsapi --help.`,
    )
  }
}
