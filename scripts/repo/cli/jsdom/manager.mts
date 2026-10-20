import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { win32 } from 'node:path'
import type { JsdomPackageManager, PackageInstallRequest } from './types.mts'

export function installProject(request: PackageInstallRequest): void {
  installWithExecutor(request, spawnSync)
}

export type PackageCommandExecutor = (
  command: string,
  args: string[],
  options: {
    cwd: string
    env: NodeJS.ProcessEnv
    stdio: 'inherit'
    shell: boolean
  },
) => { error?: Error; status: number | null; signal: NodeJS.Signals | null }

export function installWithExecutor(
  request: PackageInstallRequest,
  execute: PackageCommandExecutor,
): void {
  const active = activeManagerScript(request)
  if (active) {
    run(
      execute,
      process.execPath,
      [active, ...installArgs(request.manager)],
      request,
    )
    return
  }
  run(execute, request.manager, installArgs(request.manager), request)
}

export function activeManagerScript(
  request: PackageInstallRequest,
): string | undefined {
  const agent = request.env['npm_config_user_agent']?.trim()
  const activeName = agent?.split(/[/\s]/, 1)[0]?.toLowerCase()
  const execPath = request.env['npm_execpath']
  if (!execPath || activeName !== request.manager) {
    return undefined
  }
  const basename = request.platform === 'win32' ? win32.basename : path.basename
  const base = basename(execPath).toLowerCase()
  const matches =
    request.manager === 'npm'
      ? base === 'npm-cli.js' || base === 'npm-cli.cjs'
      : base === 'pnpm.cjs' || base === 'pnpm.js'
  return matches ? execPath : undefined
}

export function installArgs(manager: JsdomPackageManager): string[] {
  return manager === 'pnpm' ? ['install', '--no-frozen-lockfile'] : ['install']
}

export function run(
  execute: PackageCommandExecutor,
  command: string,
  args: string[],
  request: PackageInstallRequest,
): void {
  const result = execute(command, args, {
    cwd: request.cwd,
    env: request.env,
    stdio: 'inherit',
    shell: request.platform === 'win32' && command !== process.execPath,
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(
      `${request.manager} install failed with ${result.signal || result.status}.`,
    )
  }
}
