import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import path from 'node:path'
import { parse, parseAllDocuments } from 'yaml'
import { REPO_ROOT } from '../lib/paths.mts'
import manifest from '../../../.config/external-tools.json' with { type: 'json' }

type PackageConfiguration = {
  packageManager?: string
  devDependencies: Record<string, string>
  allowScripts?: Record<string, boolean>
  overrides?: Record<string, string>
  devEngines: {
    packageManager: Array<{ name: string; version: string; onFail: string }>
  }
}

type WorkspaceConfiguration = {
  catalog: Record<string, string>
  allowBuilds?: Record<string, boolean>
  overrides?: Record<string, string>
}

export function checkPackageManager(pkg: PackageConfiguration) {
  const managers = pkg.devEngines.packageManager
  if (pkg.packageManager !== undefined || managers.length !== 2) {
    throw new Error(
      "Declare npm and pnpm minimums without overriding the developer's manager.",
    )
  }
  const minimums = new Map(managers.map(manager => [manager.name, manager]))
  if (
    minimums.get('npm')?.version !== `>=${manifest.tools.npm.version}` ||
    minimums.get('pnpm')?.version !== `>=${manifest.tools.pnpm.version}` ||
    managers.some(manager => manager.onFail !== 'error')
  ) {
    throw new Error('npm and pnpm minimums must match external-tools.json.')
  }
}

export function checkCatalog(root = REPO_ROOT) {
  const workspace = readWorkspace(root)
  const pkg = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as PackageConfiguration
  checkPackageCatalog(pkg, workspace)
  checkInstallPolicies(pkg, workspace)
  checkPinnedToolVersions(root, workspace)
  checkAgentShieldLock(root)
}

export function readWorkspace(root: string): WorkspaceConfiguration {
  return parse(
    readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'),
  ) as WorkspaceConfiguration
}

export function checkPackageCatalog(
  pkg: PackageConfiguration,
  workspace: WorkspaceConfiguration,
) {
  for (const [name, version] of Object.entries(workspace.catalog)) {
    if (pkg.devDependencies[name] !== version) {
      throw new Error(`${name} must match its exact workspace catalog version.`)
    }
  }
  for (const [name, spec] of Object.entries(pkg.devDependencies)) {
    if (name.startsWith('@socketsecurity/lib')) {
      throw new Error('Inline the required Socket library helpers locally.')
    }
    if (
      spec !== workspace.catalog[name] ||
      !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(spec)
    ) {
      throw new Error(`${name} must use an exact pinned catalog version.`)
    }
  }
}

export function checkInstallPolicies(
  pkg: PackageConfiguration,
  workspace: WorkspaceConfiguration,
) {
  const buildPolicies = workspace.allowBuilds ?? {}
  if (!isDeepStrictEqual(pkg.allowScripts ?? {}, buildPolicies)) {
    throw new Error('npm allowScripts must match pnpm allowBuilds.')
  }
  if (!isDeepStrictEqual(pkg.overrides ?? {}, workspace.overrides ?? {})) {
    throw new Error('npm overrides must match pnpm overrides.')
  }
  checkPackageManager(pkg)
}

export function checkPinnedToolVersions(
  root: string,
  workspace: WorkspaceConfiguration,
) {
  if (
    workspace.catalog['ecc-agentshield'] !== manifest.tools.agentshield.version
  ) {
    throw new Error('AgentShield catalog and external-tool pins differ.')
  }
  const trainingProject = path.join(root, manifest.tools.pytorch.project)
  const trainingManifest = readFileSync(
    path.join(trainingProject, 'pyproject.toml'),
    'utf8',
  )
  const torchRequirement = new RegExp(
    `"torch==${manifest.tools.pytorch.version.replaceAll('.', '\\.')}"`,
  )
  if (!trainingManifest.match(torchRequirement)) {
    throw new Error(
      'PyTorch project dependency differs from external-tools.json.',
    )
  }
  const trainingLock = readFileSync(
    path.join(trainingProject, 'uv.lock'),
    'utf8',
  )
  if (
    !trainingLock.includes(
      `name = "torch"\nversion = "${manifest.tools.pytorch.version}"`,
    )
  ) {
    throw new Error('PyTorch lockfile differs from external-tools.json.')
  }
}

export function checkAgentShieldLock(root: string) {
  const documents = parseAllDocuments(
    readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8'),
  )
  const packages = documents.flatMap(document => {
    if (document.errors.length) {
      throw new Error('Invalid pnpm lockfile.')
    }
    const data = document.toJSON() as {
      packages?: Record<string, { resolution: { integrity?: string } }>
    }
    return Object.entries(data.packages ?? {})
  })
  const lock = { packages: Object.fromEntries(packages) }
  if (
    lock.packages[`ecc-agentshield@${manifest.tools.agentshield.version}`]
      ?.resolution.integrity !== manifest.tools.agentshield.integrity
  ) {
    throw new Error(
      'AgentShield lockfile integrity differs from external-tools.json.',
    )
  }
}
