export type PackageManagerName =
  | 'aube'
  | 'bun'
  | 'npm'
  | 'other'
  | 'pnpm'
  | 'vlt'
  | 'yarn'

const KNOWN_NAMES: ReadonlySet<string> = new Set([
  'aube',
  'bun',
  'npm',
  'pnpm',
  'vlt',
  'yarn',
])
const PNPM_COMPATIBLE: ReadonlySet<PackageManagerName> = new Set([
  'aube',
  'pnpm',
])

// The leading user-agent token identifies the invoking manager, not one on PATH.
export function invokingPackageManager(
  env: NodeJS.ProcessEnv = process.env,
): PackageManagerName | undefined {
  const agent = env.npm_config_user_agent?.trim()
  if (!agent) {
    return undefined
  }
  const name = agent.split(/[/\s]/, 1)[0].toLowerCase()
  return KNOWN_NAMES.has(name) ? (name as PackageManagerName) : 'other'
}

export function invokedByForeignPackageManager(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const name = invokingPackageManager(env)
  return name !== undefined && !PNPM_COMPATIBLE.has(name)
}

export function foreignPackageManagerMessage(
  name: PackageManagerName,
  scriptName?: string,
): string {
  const command = scriptName ? `pnpm run ${scriptName}` : 'pnpm'
  return (
    `This repository uses pnpm-compatible tooling; ${name} invoked this script.\n` +
    `Use \`${command}\` to preserve the workspace catalog, lockfile, and install policies.`
  )
}
