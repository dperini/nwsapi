import manifest from '../../../package.json' with { type: 'json' }
import { parseArgs } from 'node:util'
import { planAdd, planRemove } from './jsdom/config.mts'
import { installProject } from './jsdom/manager.mts'
import { resolveProject } from './jsdom/project.mts'
import { executePlan } from './jsdom/transaction.mts'
import type { JsdomOptions } from './jsdom/types.mts'

const manifestPeers = manifest.peerDependencies as Record<string, string>

export async function runJsdomCommand(
  argv: string[],
  options: JsdomOptions = {},
): Promise<string> {
  const [action, ...args] = argv
  if (!action || action === '--help' || action === '-h') {
    return jsdomHelp()
  }
  if (action !== 'add' && action !== 'remove') {
    throw new Error(
      `Unknown jsdom action ${JSON.stringify(action)}. Run nwsapi jsdom --help.`,
    )
  }
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    return jsdomHelp()
  }
  if (positionals.length) {
    throw new Error('Unexpected jsdom arguments. Run nwsapi jsdom --help.')
  }
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform
  const project = resolveProject(cwd, env)
  const alias = `npm:nwsapi@${manifest.version}`
  const plan =
    action === 'add'
      ? planAdd(project, alias, requiredPeer('css-tree'), requiredPeer('jsdom'))
      : planRemove(project)
  return executePlan(plan, {
    dryRun: values['dry-run'] ?? false,
    installRequest: {
      manager: project.manager,
      cwd: project.root,
      env,
      platform,
    },
    install: options.install ?? installProject,
  })
}

function requiredPeer(name: string): string {
  const value = manifestPeers[name]
  if (typeof value !== 'string') {
    throw new Error(
      `The nwsapi package does not declare the ${name} peer range.`,
    )
  }
  return value
}

function jsdomHelp(): string {
  return `Usage: nwsapi jsdom <add|remove> [--dry-run]

Commands:
  add       Override jsdom's selector with this nwsapi version
  remove    Remove the override and dependencies managed by nwsapi

Options:
  --dry-run  Preview project changes without writing or installing
  -h, --help Show this help

The project must declare a compatible jsdom peer version.`
}
