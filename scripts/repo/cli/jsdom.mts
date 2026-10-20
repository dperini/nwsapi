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
  const command = parseJsdomCommand(argv)
  if (command.kind === 'help') {
    return jsdomHelp()
  }
  if (command.kind === 'describe') {
    return command.action
      ? describeJsdomAction(command.action, command.json)
      : describeJsdom(command.json)
  }
  const { action, values } = command
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
    json: values.json ?? false,
    action,
    projectRoot: project.root,
    installRequest: {
      manager: project.manager,
      cwd: project.root,
      env,
      platform,
    },
    install: options.install ?? installProject,
  })
}

export function parseJsdomCommand(argv: string[]) {
  const [action, ...args] = argv
  if (action === '--describe') {
    return { kind: 'describe' as const, json: args.includes('--json') }
  }
  if (!action || action === '--help' || action === '-h') {
    return { kind: 'help' as const }
  }
  if (action !== 'add' && action !== 'remove') {
    throw new Error(
      `Unknown jsdom action ${JSON.stringify(action)}. Run nwsapi jsdom --help.`,
    )
  }
  const validAction = action as 'add' | 'remove'
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean' },
      describe: { type: 'boolean' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    return { kind: 'help' as const }
  }
  if (values.describe) {
    return {
      kind: 'describe' as const,
      action: validAction,
      json: values.json ?? false,
    }
  }
  if (positionals.length) {
    throw new Error('Unexpected jsdom arguments. Run nwsapi jsdom --help.')
  }
  return { kind: 'execute' as const, action: validAction, values }
}

export function requiredPeer(name: string): string {
  const value = manifestPeers[name]
  if (typeof value !== 'string') {
    throw new Error(
      `The nwsapi package does not declare the ${name} peer range.`,
    )
  }
  return value
}

export function jsdomHelp(): string {
  return `Usage: nwsapi jsdom <add|remove> [--dry-run]

Commands:
  add       Use this nwsapi version for jsdom selector queries
  remove    Restore the jsdom selector configuration managed by nwsapi

Examples:
  nwsapi jsdom add
  nwsapi jsdom remove

Run from the target project root. The command updates its package-manager
configuration and lockfile. The project must declare a compatible jsdom peer version.

Options:
  --json     Print a machine-readable result
  --describe Describe this command or action without changing files
  --dry-run  Preview project changes without writing or installing
  -h, --help Show this help`
}

export function describeJsdom(json: boolean): string {
  const description = {
    schemaVersion: 1,
    type: 'command',
    name: 'jsdom',
    description: "Manage this project's jsdom selector override.",
    actions: [
      {
        name: 'add',
        description: 'Use this nwsapi version for jsdom selector queries.',
        mutates: true,
      },
      {
        name: 'remove',
        description:
          'Restore the jsdom selector configuration managed by nwsapi.',
        mutates: true,
      },
    ],
    options: ['--json', '--describe', '--dry-run'],
  }
  return json
    ? JSON.stringify(description)
    : `${description.name}: ${description.description}\n${description.actions.map(action => `${action.name}: ${action.description}`).join('\n')}`
}

export function describeJsdomAction(
  action: 'add' | 'remove',
  json: boolean,
): string {
  const descriptions = {
    add: 'Use this nwsapi version for jsdom selector queries.',
    remove: 'Restore the jsdom selector configuration managed by nwsapi.',
  }
  const description = {
    schemaVersion: 1,
    type: 'command',
    name: `jsdom ${action}`,
    description: descriptions[action],
    mutates: true,
    options: ['--json', '--describe', '--dry-run'],
  }
  return json
    ? JSON.stringify(description)
    : `${description.name}: ${description.description}\nChanges project configuration and updates the lockfile.`
}
