import { createHash } from 'node:crypto'
import path from 'node:path'
import manifest from '../../.config/external-tools.json' with { type: 'json' }
import { REPO_ROOT } from './lib/paths.mts'
import { isMainModule } from './lib/run-node.mts'
import { parseIntegrity } from './setup/download.mts'
import { validate } from '../../.config/generated/external-tools.mts'

export interface AssetPin {
  asset: string
  binary: string
  integrity: string
  format?: string
}

export interface ToolPin {
  origin: string
  version: string
}

export interface GithubToolPin extends ToolPin {
  repository: string
  tag?: string
  platforms: Record<string, AssetPin>
}

export const GITHUB_TOOLS = [
  'pnpm',
  'nub',
  'sfw',
  'uv',
  'zizmor',
  'actionlint',
  'cdxgen',
  'opengrep',
  'trivy',
  'trufflehog',
] as const

export type GithubTool = (typeof GITHUB_TOOLS)[number]

export interface ExternalTools {
  tools: Record<GithubTool, GithubToolPin> & {
    node: ToolPin
    agentshield: ToolPin & {
      package: string
      integrity: string
      binary: string
    }
    'skill-scanner': ToolPin & {
      package: string
      platforms: Record<string, { asset: string; integrity: string }>
    }
    skillspector: ToolPin & { repository: string; project: string }
    npm: ToolPin & AssetPin & { repository: string }
  }
}

export type DownloadTool = 'npm' | GithubTool
export interface ToolPlan extends AssetPin {
  name: DownloadTool
  version: string
  url: string
}

export const TOOL_CACHE = path.join(REPO_ROOT, '.cache', 'external-tools')
export const TOOL_BIN = path.join(REPO_ROOT, '.cache', 'bin')

export function toolVersions(data: ExternalTools = manifest) {
  const versions: Record<string, string> = Object.create(null)
  const origins: Record<string, string> = {
    node: 'nub',
    npm: 'npm',
    ...Object.fromEntries(GITHUB_TOOLS.map(name => [name, 'gh-asset'])),
  }
  for (const name of ['node', 'npm', ...GITHUB_TOOLS] as const) {
    const tool = data.tools[name]
    if (
      tool?.origin !== origins[name] ||
      typeof tool.version !== 'string' ||
      !/^\d+\.\d+\.\d+$/.test(tool.version)
    ) {
      throw new Error(`Invalid external tool configuration: ${name}`)
    }
    versions[name] = tool.version
  }
  return versions
}

export function toolPlatform(
  platform: string = process.platform,
  arch: string = process.arch,
  musl = platform === 'linux' &&
    !(
      process.report.getReport() as { header: { glibcVersionRuntime?: string } }
    ).header.glibcVersionRuntime,
) {
  return `${platform}-${arch}${platform === 'linux' && musl ? '-musl' : ''}`
}

export function validAssetFormat(pin: AssetPin) {
  if (pin.format === 'binary') {
    return /^[\w][\w.-]*$/.test(pin.asset)
  }
  return (
    (pin.format === undefined || pin.format === 'archive') &&
    /^[\w.-]+\.(?:tar\.gz|tgz|zip)$/.test(pin.asset)
  )
}

export function validateAsset(
  pin: AssetPin | undefined,
): asserts pin is AssetPin {
  if (
    !pin ||
    !validAssetFormat(pin) ||
    !/^[\w./-]+$/.test(pin.binary) ||
    pin.binary.startsWith('/') ||
    pin.binary.split('/').some(part => part === '..' || !part)
  ) {
    throw new Error('Missing or invalid external tool asset or binary path.')
  }
  parseIntegrity(pin.integrity)
}

export function toolPlan(
  name: DownloadTool,
  platform = toolPlatform(),
  data: ExternalTools = manifest,
): ToolPlan {
  toolVersions(data)
  const tool = data.tools[name]
  const pin = 'platforms' in tool ? tool.platforms[platform] : tool
  validateAsset(pin)
  const repository = tool.repository
  if (name === 'npm') {
    if (repository !== 'npm:npm') {
      throw new Error('npm must use its pinned registry archive.')
    }
  } else if (!/^github:[\w-]+\/[\w.-]+$/.test(repository)) {
    throw new Error(`Invalid GitHub release repository for ${name}.`)
  }
  const url =
    name === 'npm'
      ? `https://registry.npmjs.org/npm/-/${pin.asset}`
      : `https://github.com/${repository.slice(7)}/releases/download/${'tag' in tool && tool.tag ? tool.tag : `v${tool.version}`}/${pin.asset}`
  return { name, version: tool.version, ...pin, url }
}

export function toolDirectory(plan: ToolPlan, cache = TOOL_CACHE) {
  const identity = createHash('sha256').update(plan.integrity).digest('hex')
  return path.join(cache, plan.name, `${plan.version}-${identity}`)
}

export function toolExecutable(name: DownloadTool) {
  const plan = toolPlan(name)
  return path.join(toolDirectory(plan), plan.binary)
}

export function checkExternalTools(data: ExternalTools = manifest) {
  const result = validate(data)
  if (!result.valid) {
    throw new Error(
      `Invalid external tool configuration: ${JSON.stringify(result.errors)}`,
    )
  }
  toolVersions(data)
  toolPlan('npm', undefined, data)
  parseIntegrity(data.tools.agentshield.integrity)
  for (const pin of Object.values(data.tools['skill-scanner'].platforms)) {
    parseIntegrity(pin.integrity)
  }
  for (const name of GITHUB_TOOLS) {
    if (!Object.keys(data.tools[name].platforms).length) {
      throw new Error(`No release platforms configured for ${name}.`)
    }
    for (const platform of Object.keys(data.tools[name].platforms)) {
      toolPlan(name, platform, data)
    }
  }
}

if (isMainModule(import.meta.url)) {
  checkExternalTools()
  console.log(JSON.stringify(toolVersions()))
}
