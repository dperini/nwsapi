import type { JsdomPackageManager } from './types.mts'
import type { PackageJson } from './project.mts'
import {
  asRecord,
  jsonOverrideMap,
  packageManagerLocation,
  type OverrideEntry,
  type WorkspaceYaml,
  SELECTOR_PACKAGE,
} from './shared.mts'

export function checkAlternateOverrides(
  packageJson: PackageJson,
  yamlFile: WorkspaceYaml | undefined,
  manager: JsdomPackageManager,
  alias: string,
): void {
  const npmOverrides = jsonOverrideMap(packageJson, 'overrides')
  checkAlternateMap(npmOverrides, 'package.json overrides', alias)
  const pnpm = asRecord(packageJson['pnpm'])
  const legacyPnpm = pnpm ? asRecord(pnpm['overrides']) : undefined
  if (pnpm?.['overrides'] !== undefined && !legacyPnpm) {
    throw new Error('package.json pnpm.overrides must be a mapping.')
  }
  if (findTargetKeys(legacyPnpm).length) {
    throw new Error(
      'package.json pnpm.overrides contains a selector override. Move it to pnpm-workspace.yaml overrides before using this command.',
    )
  }
  if (yamlFile && manager === 'npm') {
    const workspaceOverrides = yamlOverrideMap(yamlFile)
    checkAlternateMap(
      workspaceOverrides,
      'pnpm-workspace.yaml overrides',
      alias,
    )
  }
  if (yamlFile && manager === 'pnpm') {
    checkAlternateMap(
      yamlOverrideMap(yamlFile),
      'pnpm-workspace.yaml overrides',
      alias,
    )
  }
}

export function activeOverrideMap(
  packageJson: PackageJson,
  yamlFile: WorkspaceYaml | undefined,
  manager: JsdomPackageManager,
): Record<string, unknown> | undefined {
  if (manager === 'npm') {
    return jsonOverrideMap(packageJson, 'overrides')
  }
  return yamlOverrideMap(yamlFile)
}

export function readActiveOverride(
  packageJson: PackageJson,
  yamlFile: WorkspaceYaml | undefined,
  manager: JsdomPackageManager,
): OverrideEntry {
  const map = activeOverrideMap(packageJson, yamlFile, manager)
  if (!map || !Object.hasOwn(map, SELECTOR_PACKAGE)) {
    return { exists: false }
  }
  return { exists: true, value: map[SELECTOR_PACKAGE] }
}

export function setActiveOverride(
  packageJson: PackageJson,
  yamlFile: WorkspaceYaml | undefined,
  manager: JsdomPackageManager,
  alias: string,
): boolean {
  if (manager === 'npm') {
    let map = jsonOverrideMap(packageJson, 'overrides')
    const created = !map
    if (!map) {
      map = {}
      packageJson['overrides'] = map
    }
    map[SELECTOR_PACKAGE] = alias
    return created
  }
  if (!yamlFile) {
    throw new Error('The pnpm workspace configuration is unavailable.')
  }
  const created = !yamlOverrideMap(yamlFile)
  if (created) {
    yamlFile.document.set('overrides', yamlFile.document.createNode({}))
  }
  yamlFile.document.setIn(['overrides', SELECTOR_PACKAGE], alias)
  return created
}

export function deleteActiveOverride(
  packageJson: PackageJson,
  yamlFile: WorkspaceYaml | undefined,
  manager: JsdomPackageManager,
): void {
  if (manager === 'npm') {
    const map = jsonOverrideMap(packageJson, 'overrides')
    if (map) {
      delete map[SELECTOR_PACKAGE]
    }
    return
  }
  yamlFile?.document.deleteIn(['overrides', SELECTOR_PACKAGE])
}

export function checkAlternateMap(
  map: Record<string, unknown> | undefined,
  location: string,
  alias: string,
): void {
  if (!map) {
    return
  }
  rejectScopedOverrideConflicts(map)
  if (Object.hasOwn(map, SELECTOR_PACKAGE) && map[SELECTOR_PACKAGE] !== alias) {
    throw new Error(
      `${location} contains a conflicting ${SELECTOR_PACKAGE} override. Resolve it before running this command.`,
    )
  }
}

export function rejectScopedOverrideConflicts(
  map: Record<string, unknown> | undefined,
): void {
  visitOverrideMap(map, true)
}

export function visitOverrideMap(
  map: Record<string, unknown> | undefined,
  root: boolean,
): void {
  if (!map) {
    return
  }
  for (const [key, value] of Object.entries(map)) {
    const exactRootKey = root && key === SELECTOR_PACKAGE
    if (matchesTargetOverride(key) && !exactRootKey) {
      throw new Error(
        `A nested or version-qualified ${SELECTOR_PACKAGE} override exists at ${key}. Resolve it before running this command.`,
      )
    }
    if (exactRootKey && asRecord(value)) {
      throw new Error(
        `The ${SELECTOR_PACKAGE} override must be a single package specifier.`,
      )
    }
    const nested = asRecord(value)
    if (nested) {
      visitOverrideMap(nested, false)
    }
  }
}

export function matchesTargetOverride(key: string): boolean {
  return key.split('>').some(part => {
    const normalized = part.trim()
    return (
      normalized === SELECTOR_PACKAGE ||
      normalized.startsWith(`${SELECTOR_PACKAGE}@`)
    )
  })
}

export function findTargetKeys(
  map: Record<string, unknown> | undefined,
  prefix = '',
): string[] {
  if (!map) {
    return []
  }
  const matches: string[] = []
  for (const [key, value] of Object.entries(map)) {
    const current = prefix ? `${prefix}.${key}` : key
    if (matchesTargetOverride(key)) {
      matches.push(current)
    }
    const nested = asRecord(value)
    if (nested) {
      matches.push(...findTargetKeys(nested, current))
    }
  }
  return matches
}

export function yamlOverrideMap(
  yamlFile: WorkspaceYaml | undefined,
): Record<string, unknown> | undefined {
  if (!yamlFile) {
    return undefined
  }
  const value = yamlFile.document.get('overrides', true)?.toJSON()
  if (value === undefined) {
    return undefined
  }
  const map = asRecord(value)
  if (!map) {
    throw new Error(`${yamlFile.path} overrides must be a mapping.`)
  }
  return map
}

export function createdOverrideMap(
  packageJson: PackageJson,
  yamlFile: WorkspaceYaml | undefined,
  manager: JsdomPackageManager,
): boolean {
  if (manager === 'npm') {
    return !jsonOverrideMap(packageJson, 'overrides')
  }
  return !yamlOverrideMap(yamlFile)
}

export function overrideMapIsEmpty(
  packageJson: PackageJson,
  yamlFile: WorkspaceYaml | undefined,
  manager: JsdomPackageManager,
): boolean {
  const map = activeOverrideMap(packageJson, yamlFile, manager)
  return Boolean(map && Object.keys(map).length === 0)
}

export function overrideLocationMatches(
  location: string,
  manager: JsdomPackageManager,
): boolean {
  return location === packageManagerLocation(manager)
}
