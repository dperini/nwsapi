import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { TOOL_CACHE, toolDirectory } from '../external-tools.mts'
import { isPathWithinRoot } from '../lib/paths.mts'
import type { ToolPlan } from '../external-tools.mts'
import {
  compareTrees,
  extractArchive,
  formatTreeMismatches,
  matchesArchive,
  reconcileTree,
} from './archive.mts'
import { downloadArchive } from './download.mts'

export function stageTool(plan: ToolPlan, bytes: Buffer, staging: string) {
  if (plan.format === 'binary') {
    const binary = path.join(staging, plan.binary)
    mkdirSync(path.dirname(binary), { recursive: true })
    writeFileSync(binary, bytes, { mode: 0o600, flag: 'wx' })
    return
  }
  const archive = path.join(staging, plan.asset)
  writeFileSync(archive, bytes, { mode: 0o600, flag: 'wx' })
  extractArchive(plan.asset, staging)
  rmSync(archive)
}

export function normalizedExecutable(value: string, platform: string) {
  let resolved = path.resolve(value)
  try {
    resolved = realpathSync(resolved)
  } catch {
    // The textual resolved path still allows matching a removed active executable.
  }
  return platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function isActiveToolExecutable(
  executable: string,
  environment: NodeJS.ProcessEnv = process.env,
  processExecutable = process.execPath,
  platform = process.platform,
) {
  const active = [environment['npm_execpath'], processExecutable].filter(
    (value): value is string => Boolean(value),
  )
  const expected = normalizedExecutable(executable, platform)
  return active.some(
    value => normalizedExecutable(value, platform) === expected,
  )
}

export function executableMatches(
  target: string,
  staging: string,
  binary: string,
) {
  const rootStat = lstatSync(target)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    return false
  }
  const parts = binary.split('/').filter(Boolean)
  let cached = target
  let expected = staging
  for (let index = 0; index < parts.length; index += 1) {
    cached = path.join(cached, parts[index]!)
    expected = path.join(expected, parts[index]!)
    let actualStat
    try {
      actualStat = lstatSync(cached)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false
      }
      throw error
    }
    if (index < parts.length - 1) {
      if (actualStat.isSymbolicLink() || !actualStat.isDirectory()) {
        return false
      }
    } else if (!actualStat.isFile() || !lstatSync(expected).isFile()) {
      return false
    } else {
      return readFileSync(cached).equals(readFileSync(expected))
    }
  }
  return false
}

export function activeExecutableDiffers(
  plan: ToolPlan,
  target: string,
  staging: string,
  platform: string,
  environment: NodeJS.ProcessEnv,
  processExecutable: string,
) {
  return (
    platform === 'win32' &&
    isActiveToolExecutable(
      path.join(target, plan.binary),
      environment,
      processExecutable,
      platform,
    ) &&
    !executableMatches(target, staging, plan.binary)
  )
}

export async function installTool(
  plan: ToolPlan,
  cache = TOOL_CACHE,
  request: typeof fetch = fetch,
  platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  processExecutable = process.execPath,
) {
  const bytes = await downloadArchive(
    plan.url,
    plan.integrity,
    path.join(cache, 'archives'),
    request,
  )
  const target = toolDirectory(plan, cache)
  const parent = path.dirname(target)
  mkdirSync(parent, { recursive: true })
  const staging = mkdtempSync(path.join(parent, '.install-'))
  try {
    stageTool(plan, bytes, staging)
    const executable = path.join(staging, plan.binary)
    if (
      !lstatSync(executable).isFile() ||
      !isPathWithinRoot(realpathSync(executable), realpathSync(staging))
    ) {
      throw new Error(`Invalid executable in ${plan.asset}: ${plan.binary}`)
    }
    chmodSync(executable, 0o755)
    // Compare cached files with a fresh installation of the verified download.
    const reused = matchesArchive(target, staging, platform)
    if (!reused && existsSync(target)) {
      const mismatches = compareTrees(target, staging, platform)
      console.error(
        `Repairing verified ${plan.name} cache with ${mismatches.length} mismatch${mismatches.length === 1 ? '' : 'es'}:\n${formatTreeMismatches(mismatches)}`,
      )
      if (
        activeExecutableDiffers(
          plan,
          target,
          staging,
          platform,
          environment,
          processExecutable,
        )
      ) {
        throw new Error(
          `The active ${plan.name} executable differs from its verified download. Close this package-manager process, then run node scripts/repo/setup/bootstrap.mts to repair it.\n${formatTreeMismatches(mismatches)}`,
        )
      }
      reconcileTree(target, staging, platform)
    } else if (!reused) {
      renameSync(staging, target)
    }
    console.log(
      `Verified ${plan.name} ${plan.version}: ${plan.asset} (${reused ? 'reused verified cache' : 'installed'})`,
    )
    return path.join(target, plan.binary)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
