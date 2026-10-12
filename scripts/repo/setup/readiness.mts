import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { managedReady, managedVersions } from './diagnostics.mts'
import { packageFiles } from '../../../.config/build.config.mts'

interface PackageManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

interface PnpmResolution {
  specifier?: string
  version?: string
}

interface PnpmLock {
  importers?: Record<string, Record<string, Record<string, PnpmResolution>>>
  catalogs?: Record<string, Record<string, PnpmResolution>>
}

interface PnpmWorkspace {
  catalog?: Record<string, string>
  catalogs?: Record<string, Record<string, string>>
  overrides?: Record<string, string>
}

export interface CheckoutReadiness {
  tools: { ready: boolean; detail: string }
  dependencies: { ready: boolean; issues: string[] }
  build: { ready: boolean; issues: string[] }
}

const BUILD_OUTPUTS = packageFiles.map(file => file.output)

export async function checkoutReadiness(
  root: string,
  verifiedToolsReady?: boolean,
) {
  const toolsReady = verifiedToolsReady ?? managedReady(managedVersions())
  const dependencies = await dependencyReadiness(root)
  const build = buildReadiness(root)
  return {
    tools: {
      ready: toolsReady,
      detail: toolsReady ? 'Pinned checkout tools are ready.' : 'Run setup.',
    },
    dependencies,
    build,
  } satisfies CheckoutReadiness
}

export async function menuReadiness(root: string) {
  const readiness = await checkoutReadiness(root)
  return {
    guide: taskStatus(readiness),
    review: taskStatus(readiness),
  }
}

export async function taskReadiness(taskId: string, root: string) {
  if (taskId !== 'guide' && taskId !== 'review') {
    return { ready: true, message: '' }
  }
  const readiness = await checkoutReadiness(root)
  return readinessForTask(readiness, taskId)
}

export function readinessForTask(
  readiness: CheckoutReadiness,
  _taskId: 'guide' | 'review',
) {
  return taskStatus(readiness)
}

function taskStatus(readiness: CheckoutReadiness) {
  const issues: string[] = []
  if (!readiness.tools.ready) {
    issues.push('Pinned checkout tools are not ready.')
  }
  issues.push(...readiness.dependencies.issues)
  if (issues.length === 0) {
    return { ready: true, message: '' }
  }
  return {
    ready: false,
    message: `${issues.join(' ')} Run node scripts/repo/setup/bootstrap.mts, then retry.`,
  }
}

export async function dependencyReadiness(root: string) {
  const nodeModules = path.join(root, 'node_modules')
  const pnpmMarker = existsSync(path.join(nodeModules, '.modules.yaml'))
  const npmMarker = existsSync(path.join(nodeModules, '.package-lock.json'))
  if (pnpmMarker && npmMarker) {
    return {
      ready: false,
      issues: [
        'Mixed npm and pnpm installation metadata was found. Run setup.',
      ],
    }
  }
  if (npmMarker) {
    return npmDependencyReadiness(root, nodeModules)
  }
  if (!pnpmMarker) {
    return {
      ready: false,
      issues: ['Dependencies are not installed. Run setup.'],
    }
  }
  try {
    const { parseAllDocuments, parse } = await import('yaml')
    const manifest = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    ) as PackageManifest
    const lock = parseLockDocuments(
      parseAllDocuments(
        readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8'),
      ),
    )
    const workspace = parse(
      readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'),
    ) as PnpmWorkspace
    const importer = lock.importers?.['.']
    if (!importer) {
      return { ready: false, issues: ['pnpm lockfile has no root importer.'] }
    }
    const issues = checkManifestCatalog(manifest, workspace)
    issues.push(
      ...checkDependencyGroup(
        root,
        nodeModules,
        'dependencies',
        manifest.dependencies ?? {},
        importer['dependencies'] ?? {},
        workspace,
        lock.catalogs ?? {},
      ),
    )
    issues.push(
      ...checkDependencyGroup(
        root,
        nodeModules,
        'devDependencies',
        manifest.devDependencies ?? {},
        importer['devDependencies'] ?? {},
        workspace,
        lock.catalogs ?? {},
      ),
      ...checkOptionalPeerGroup(
        root,
        nodeModules,
        manifest,
        importer,
        workspace,
        lock.catalogs ?? {},
      ),
    )
    return { ready: issues.length === 0, issues }
  } catch (error) {
    return {
      ready: false,
      issues: [
        `Could not verify pnpm dependencies: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }
}

async function npmDependencyReadiness(root: string, nodeModules: string) {
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    ) as PackageManifest
    const lock = JSON.parse(
      readFileSync(path.join(root, 'package-lock.json'), 'utf8'),
    ) as {
      lockfileVersion?: number
      packages?: Record<string, NpmLockPackage>
    }
    const hidden = JSON.parse(
      readFileSync(path.join(nodeModules, '.package-lock.json'), 'utf8'),
    ) as NpmLock
    const rootLock = lock.packages?.['']
    const issues: string[] = []
    if (lock.lockfileVersion !== 3 || hidden.lockfileVersion !== 3) {
      issues.push('npm lock metadata must use lockfileVersion 3.')
    }
    const { parse } = await import('yaml')
    const workspace = parse(
      readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8'),
    ) as PnpmWorkspace
    issues.push(...checkManifestCatalog(manifest, workspace))
    for (const [group, requested] of [
      ['dependencies', manifest.dependencies ?? {}],
      ['devDependencies', manifest.devDependencies ?? {}],
    ] as const) {
      issues.push(
        ...checkNpmDependencyGroup(
          root,
          nodeModules,
          group,
          requested,
          lock.packages ?? {},
          hidden.packages ?? {},
          rootLock?.[group] ?? {},
        ),
      )
    }
    if (!rootLock) {
      issues.push('package-lock.json has no root package entry.')
    }
    return { ready: issues.length === 0, issues }
  } catch (error) {
    return {
      ready: false,
      issues: [
        `Could not verify npm dependencies: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }
}

interface NpmLock {
  lockfileVersion?: number
  packages?: Record<string, NpmLockPackage>
}

interface NpmLockPackage {
  version?: string
  integrity?: string
  dev?: boolean
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function checkManifestCatalog(
  manifest: PackageManifest,
  workspace: PnpmWorkspace,
) {
  return Object.entries(manifest.devDependencies ?? {})
    .filter(
      ([name, version]) =>
        !version.startsWith('catalog:') &&
        workspace.catalog?.[name] !== version,
    )
    .map(
      ([name]) => `${name}: package.json does not match the workspace catalog.`,
    )
}

function checkNpmDependencyGroup(
  root: string,
  nodeModules: string,
  group: 'dependencies' | 'devDependencies',
  requested: Record<string, string>,
  lockedPackages: Record<string, NpmLockPackage>,
  installedPackages: Record<string, NpmLockPackage>,
  rootRequested: Record<string, string>,
) {
  const issues: string[] = []
  const names = Object.keys(requested).sort()
  if (
    names.length !== Object.keys(rootRequested).length ||
    names.some(name => rootRequested[name] !== requested[name])
  ) {
    issues.push(`package-lock.json ${group} do not match package.json.`)
  }
  for (const name of names) {
    const specifier = requested[name]!
    const packagePath = `node_modules/${name}`
    const locked = lockedPackages[packagePath]
    const installed = installedPackages[packagePath]
    if (
      locked?.version !== specifier ||
      !locked.integrity ||
      installed?.version !== locked.version ||
      installed.integrity !== locked.integrity
    ) {
      issues.push(`${name}: npm lock metadata does not match.`)
      continue
    }
    const actual = installedPackage(root, nodeModules, name, locked.version)
    if (!actual.ready) {
      issues.push(`${name}: ${actual.issue}`)
    }
  }
  return issues
}

function checkOptionalPeerGroup(
  root: string,
  nodeModules: string,
  manifest: PackageManifest,
  importer: Record<string, Record<string, PnpmResolution>>,
  workspace: PnpmWorkspace,
  catalogs: Record<string, Record<string, PnpmResolution>>,
) {
  const peers: Record<string, string> = {}
  const locked: Record<string, PnpmResolution> = {}
  for (const [name, specifier] of Object.entries(
    manifest.peerDependencies ?? {},
  )) {
    if (
      manifest.peerDependenciesMeta?.[name]?.optional !== true ||
      manifest.dependencies?.[name] ||
      manifest.devDependencies?.[name]
    ) {
      continue
    }
    const resolution =
      importer['dependencies']?.[name] ?? importer['devDependencies']?.[name]
    if (resolution) {
      peers[name] = specifier
      locked[name] = resolution
    }
  }
  return checkDependencyGroup(
    root,
    nodeModules,
    'optional peerDependencies',
    peers,
    locked,
    workspace,
    catalogs,
  )
}

function parseLockDocuments(
  documents: Array<{ errors: Error[]; toJSON(): unknown }>,
): PnpmLock {
  const result: PnpmLock = {}
  for (const document of documents) {
    if (document.errors.length > 0) {
      throw document.errors[0]
    }
    const value = document.toJSON() as PnpmLock | null
    if (!value) {
      continue
    }
    result.importers = mergeImporterMaps(result.importers, value.importers)
    result.catalogs = mergeCatalogMaps(result.catalogs, value.catalogs)
  }
  return result
}

function mergeImporterMaps(
  current: PnpmLock['importers'],
  next: PnpmLock['importers'],
): NonNullable<PnpmLock['importers']> {
  const merged = { ...current }
  for (const [name, importer] of Object.entries(next ?? {})) {
    merged[name] = { ...merged[name], ...importer }
  }
  return merged
}

function mergeCatalogMaps(
  current: PnpmLock['catalogs'],
  next: PnpmLock['catalogs'],
): NonNullable<PnpmLock['catalogs']> {
  const merged = { ...current }
  for (const [catalog, entries] of Object.entries(next ?? {})) {
    merged[catalog] = { ...merged[catalog], ...entries }
  }
  return merged
}

function checkDependencyGroup(
  root: string,
  nodeModules: string,
  group: 'dependencies' | 'devDependencies' | 'optional peerDependencies',
  requested: Record<string, string>,
  locked: Record<string, PnpmResolution>,
  workspace: PnpmWorkspace,
  lockCatalogs: Record<string, Record<string, PnpmResolution>>,
) {
  const issues: string[] = []
  for (const [name, specifier] of Object.entries(requested)) {
    const resolution = locked[name]
    if (
      !resolution?.version ||
      (!specifier.startsWith('catalog:') && resolution.specifier !== specifier)
    ) {
      issues.push(`${name}: ${group} does not match pnpm-lock.yaml.`)
      continue
    }
    const catalogIssue = catalogResolutionIssue(
      name,
      specifier,
      resolution,
      workspace,
      lockCatalogs,
    )
    if (catalogIssue) {
      issues.push(catalogIssue)
      continue
    }
    const actual = installedPackage(root, nodeModules, name, resolution.version)
    if (!actual.ready) {
      issues.push(`${name}: ${actual.issue}`)
    }
  }
  return issues
}

function catalogResolutionIssue(
  name: string,
  specifier: string,
  resolution: PnpmResolution,
  workspace: PnpmWorkspace,
  lockCatalogs: Record<string, Record<string, PnpmResolution>>,
) {
  if (!specifier.startsWith('catalog:')) {
    return undefined
  }
  const catalogName = specifier.slice('catalog:'.length) || 'default'
  const catalog =
    catalogName === 'default'
      ? workspace.catalog
      : workspace.catalogs?.[catalogName]
  const expected = catalog?.[name]
  const version = resolution.version?.split('(')[0]
  const locked = lockCatalogs[catalogName]?.[name]
  if (
    !expected ||
    !version ||
    !catalogImporterMatches(resolution.specifier, expected, specifier) ||
    !catalogEntryMatches(locked, expected, version, workspace.overrides?.[name])
  ) {
    return `${name}: pnpm lockfile does not match the workspace catalog.`
  }
  return undefined
}

function catalogImporterMatches(
  specifier: string | undefined,
  expected: string,
  request: string,
) {
  return specifier === expected || specifier === request
}

function catalogEntryMatches(
  locked: PnpmResolution | undefined,
  expected: string,
  version: string,
  override: string | undefined,
) {
  if (locked) {
    return locked.specifier === expected && locked.version === version
  }
  return override === expected && version === expected
}

function installedPackage(
  root: string,
  nodeModules: string,
  name: string,
  lockedVersion: string,
) {
  try {
    const packagePath = path.join(nodeModules, name, 'package.json')
    const actual = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      version?: string
      name?: string
    }
    if (lockedVersion.startsWith('link:')) {
      const linkPath = path.resolve(root, lockedVersion.slice('link:'.length))
      const linkReal = realpathSync(path.join(nodeModules, name))
      if (linkReal !== realpathSync(linkPath)) {
        return { ready: false, issue: 'workspace link differs from lockfile.' }
      }
      if (actual.name !== name) {
        return { ready: false, issue: 'workspace package name does not match.' }
      }
      return { ready: true, issue: '' }
    }
    const expectedVersion = lockedVersion.split('(')[0]
    if (actual.version !== expectedVersion) {
      return {
        ready: false,
        issue: `expected ${expectedVersion}, found ${actual.version ?? 'missing'}.`,
      }
    }
    return { ready: true, issue: '' }
  } catch {
    return { ready: false, issue: 'package is missing or unreadable.' }
  }
}

export function buildReadiness(root: string) {
  const issues = BUILD_OUTPUTS.filter(
    file => !existsSync(path.join(root, file)),
  )
  return {
    ready: issues.length === 0,
    issues: issues.map(file => `Required build output is missing: ${file}.`),
  }
}
