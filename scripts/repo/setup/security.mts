import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import manifest from '../../../.config/external-tools.json' with { type: 'json' }
import {
  TOOL_BIN,
  toolExecutable,
  toolPlan,
  toolPlatform,
} from '../external-tools.mts'
import type { GithubTool } from '../external-tools.mts'
import { REPO_ROOT } from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'
import { checked, execute } from '../lib/command.mts'
import type { CommandRunner } from '../lib/command.mts'
import { activateTool } from './tools.mts'
import { installTool } from './install.mts'
import { downloadArchive } from './download.mts'

export function securityTools(all = false): GithubTool[] {
  return [
    'uv',
    'zizmor',
    'actionlint',
    ...(all ? (['cdxgen', 'opengrep', 'trivy', 'trufflehog'] as const) : []),
  ]
}

export function securityEnvironment(root = REPO_ROOT) {
  return {
    ...process.env,
    UV_TOOL_DIR: path.join(root, '.cache/security/python'),
    UV_TOOL_BIN_DIR: path.join(root, '.cache/bin'),
    UV_CACHE_DIR: path.join(root, '.cache/uv'),
  }
}

export function scannerWheel(platform = toolPlatform()) {
  const tool = manifest.tools['skill-scanner']
  const platforms: Record<string, { asset: string; integrity: string }> =
    tool.platforms
  const pin = platforms[platform]
  if (!pin) {
    throw new Error(
      `No verified Skill Scanner wheel for ${platform}. Use a supported security runner.`,
    )
  }
  const url = new URL(pin.asset)
  const filename = path.posix.basename(url.pathname)
  if (
    url.origin !== 'https://files.pythonhosted.org' ||
    url.username ||
    url.password ||
    !filename.startsWith(`cisco_ai_skill_scanner-${tool.version}-`) ||
    !filename.endsWith('.whl')
  ) {
    throw new Error('Invalid Skill Scanner wheel URL.')
  }
  return { ...pin, filename }
}

export function scannerExecutable(root = REPO_ROOT) {
  return path.join(
    root,
    '.cache/security/python/cisco-ai-skill-scanner',
    process.platform === 'win32'
      ? 'Scripts/skill-scanner.exe'
      : 'bin/skill-scanner',
  )
}

export async function installSkillScanner(
  run: CommandRunner = execute,
  root = REPO_ROOT,
  download = downloadArchive,
  activate = activateTool,
) {
  const pin = scannerWheel()
  const bytes = await download(
    pin.asset,
    pin.integrity,
    path.join(root, '.cache/external-tools/archives'),
  )
  const directory = path.join(root, '.cache/external-tools/wheels')
  mkdirSync(directory, { recursive: true })
  const wheel = path.join(directory, pin.filename)
  writeFileSync(wheel, bytes)
  const environment = securityEnvironment(root)
  const uv = toolExecutable('uv')
  checked(
    uv,
    ['tool', 'install', '--python', '3.13', '--exclude-newer', '7d', wheel],
    { cwd: root, env: environment, interactive: true },
    run,
  )
  const executable = scannerExecutable(root)
  const version = checked(
    executable,
    ['--version'],
    { cwd: root, env: environment },
    run,
  )
  if (
    !(
      version.match(/\b\d+\.\d+\.\d+\b/)?.[0] ===
      manifest.tools['skill-scanner'].version
    )
  ) {
    throw new Error(`Unexpected Skill Scanner version: ${version}`)
  }
  activate('skill-scanner', executable, path.join(root, '.cache/bin'))
  return executable
}

export function installSkillSpector(
  run: CommandRunner = execute,
  root = REPO_ROOT,
  activate = activateTool,
) {
  const pin = manifest.tools.skillspector
  const project = path.join(root, pin.project)
  const lock = readFileSync(path.join(project, 'uv.lock'), 'utf8')
  if (!lock.includes(`#${pin.version}`)) {
    throw new Error('SkillSpector lock does not match its pinned commit.')
  }
  const environment = {
    ...securityEnvironment(root),
    UV_PROJECT_ENVIRONMENT: path.join(root, '.cache/security/skillspector'),
  }
  checked(
    toolExecutable('uv'),
    ['sync', '--project', project, '--python', '3.12', '--locked', '--no-dev'],
    { cwd: root, env: environment, interactive: true },
    run,
  )
  const executable = path.join(
    environment.UV_PROJECT_ENVIRONMENT,
    process.platform === 'win32'
      ? 'Scripts/skillspector.exe'
      : 'bin/skillspector',
  )
  if (!existsSync(executable)) {
    throw new Error('SkillSpector installation did not produce its executable.')
  }
  activate('skillspector', executable, path.join(root, '.cache/bin'))
  return executable
}

export const SECURITY_OPERATIONS = {
  installTool,
  checked,
  activateTool,
  installSkillScanner,
  installSkillSpector,
}

export async function setupSecurity(
  all = false,
  operations = SECURITY_OPERATIONS,
) {
  for (const name of securityTools(all)) {
    const executable = await operations.installTool(toolPlan(name))
    operations.checked(executable, ['--version'], { cwd: REPO_ROOT })
    operations.activateTool(name, executable)
  }
  await operations.installSkillScanner()
  if (all) {
    operations.installSkillSpector()
  }
  return TOOL_BIN
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: pnpm run setup:security [--all]')
    return
  }
  if (args.some(arg => arg !== '--all')) {
    throw new Error('Usage: pnpm run setup:security [--all]')
  }
  await setupSecurity(args.includes('--all'))
}

if (isMainModule(import.meta.url)) {
  await main()
}
