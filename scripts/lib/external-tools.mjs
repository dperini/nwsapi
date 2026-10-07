import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseIntegrity } from './tools/download.mjs'

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const TOOL_CACHE = path.join(REPO_ROOT, '.cache', 'external-tools')
export const TOOL_BIN = path.join(REPO_ROOT, '.cache', 'bin')
export const manifest = JSON.parse(
  readFileSync(
    new URL('../../.config/external-tools.json', import.meta.url),
    'utf8',
  ),
)

export function toolVersion(name, data = manifest) {
  const version = data.tools[name]?.version
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    throw Object.assign(new Error(`Invalid tool version: ${name}`), {
      code: 'ERR_TOOL_PIN',
    })
  }
  return version
}

export function toolVersions(data = manifest) {
  return Object.fromEntries(
    Object.keys(data.tools).map(name => [name, toolVersion(name, data)]),
  )
}

export function toolPlatform(platform = process.platform, arch = process.arch) {
  const musl =
    platform === 'linux' &&
    !process.report.getReport().header.glibcVersionRuntime
  return `${platform}-${arch}${musl ? '-musl' : ''}`
}

export function toolPlan(name, platform = toolPlatform(), data = manifest) {
  const version = toolVersion(name, data)
  const tool = data.tools[name]
  const pin = tool.platforms ? tool.platforms[platform] : tool
  if (
    !pin ||
    !/^[\w.-]+\.(?:tar\.gz|tgz|zip)$/.test(pin.asset) ||
    !/^[\w./-]+$/.test(pin.binary) ||
    pin.binary.startsWith('/') ||
    pin.binary.split('/').some(part => part === '..' || !part)
  ) {
    throw Object.assign(
      new Error(`Missing or invalid asset: ${name}/${platform}`),
      { code: 'ERR_TOOL_PIN' },
    )
  }
  parseIntegrity(pin.integrity)
  const npm = name === 'npm'
  if (
    npm
      ? tool.origin !== 'npm' || tool.repository !== 'npm:npm'
      : tool.origin !== 'gh-asset' ||
        !/^github:[\w-]+\/[\w.-]+$/.test(tool.repository)
  ) {
    throw Object.assign(new Error(`Invalid tool origin: ${name}`), {
      code: 'ERR_TOOL_PIN',
    })
  }
  const url = npm
    ? `https://registry.npmjs.org/npm/-/${pin.asset}`
    : `https://github.com/${tool.repository.slice(7)}/releases/download/${tool.tag ?? `v${version}`}/${pin.asset}`
  return { ...pin, name, version, url }
}

export function toolDirectory(plan, cache = TOOL_CACHE) {
  const identity = createHash('sha256').update(plan.integrity).digest('hex')
  return path.join(cache, plan.name, `${plan.version}-${identity}`)
}

export function toolExecutable(name) {
  const plan = toolPlan(name)
  return path.join(toolDirectory(plan), plan.binary)
}
