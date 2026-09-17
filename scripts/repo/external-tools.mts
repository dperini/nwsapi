import { createHash } from 'node:crypto'
import path from 'node:path'
import manifest from '../../.config/external-tools.json' with { type: 'json' }
import { REPO_ROOT } from './lib/paths.mts'
import { isMainModule } from './lib/run-node.mts'
import { parseIntegrity } from './setup/download.mts'

export interface AssetPin {
  asset: string
  binary: string
  integrity: string
  format?: string
}

interface ToolPin {
  origin: string
  version: string
}

export interface ExternalTools {
  tools: {
    node: ToolPin
    npm: ToolPin & AssetPin & { repository: string }
    pnpm: ToolPin & { repository: string; platforms: Record<string, AssetPin> }
    nub: ToolPin & { repository: string; platforms: Record<string, AssetPin> }
    sfw: ToolPin & { repository: string; platforms: Record<string, AssetPin> }
  }
}

export type DownloadTool = 'npm' | 'pnpm' | 'nub' | 'sfw'
export interface ToolPlan extends AssetPin {
  name: DownloadTool
  version: string
  url: string
}

export const TOOL_CACHE = path.join(REPO_ROOT, '.cache', 'external-tools')
export const TOOL_BIN = path.join(REPO_ROOT, '.cache', 'bin')

export function toolVersions(data: ExternalTools = manifest) {
  const versions: Record<string, string> = Object.create(null)
  const origins = {
    node: 'nub',
    npm: 'npm',
    pnpm: 'gh-asset',
    nub: 'gh-asset',
    sfw: 'gh-asset',
  }
  for (const name of ['node', 'npm', 'pnpm', 'nub', 'sfw'] as const) {
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
      : `https://github.com/${repository.slice(7)}/releases/download/v${tool.version}/${pin.asset}`
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
  toolVersions(data)
  toolPlan('npm', undefined, data)
  for (const name of ['pnpm', 'nub', 'sfw'] as const) {
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
