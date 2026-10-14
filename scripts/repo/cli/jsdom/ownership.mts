import type { CreatedMap, JsdomOverrideMetadata } from './types.mts'
import type { JsdomPackageManager } from './types.mts'
import type { PackageJson } from './project.mts'
import {
  asRecord,
  isEmptyRecord,
  isYamlEmptyMap,
  type WorkspaceYaml,
} from './shared.mts'
import { overrideLocationMatches, overrideMapIsEmpty } from './overrides.mts'
import { CSS_TREE_PACKAGE, SELECTOR_PACKAGE } from './shared.mts'

export function readMetadata(
  packageJson: PackageJson,
): JsdomOverrideMetadata | undefined {
  if (packageJson['nwsapi'] !== undefined && !asRecord(packageJson['nwsapi'])) {
    throw new Error('package.json nwsapi metadata must be a mapping.')
  }
  const namespace = asRecord(packageJson['nwsapi'])
  if (!namespace || !Object.hasOwn(namespace, 'jsdomOverride')) {
    return undefined
  }
  const raw = namespace['jsdomOverride']
  if (!asRecord(raw)) {
    throw new Error('package.json nwsapi.jsdomOverride metadata is malformed.')
  }
  validateMetadata(raw as unknown as JsdomOverrideMetadata)
  return raw as unknown as JsdomOverrideMetadata
}

export function validateMetadata(value: JsdomOverrideMetadata): void {
  if (
    !isValidMetadataHeader(value) ||
    !isValidMetadataCollections(value) ||
    !isValidCreatedWorkspaceYaml(value)
  ) {
    throw new Error('package.json nwsapi.jsdomOverride metadata is malformed.')
  }
}

function isValidMetadataHeader(value: JsdomOverrideMetadata): boolean {
  return (
    value.schemaVersion === 1 &&
    (value.manager === 'npm' || value.manager === 'pnpm') &&
    asRecord(value.override) !== undefined &&
    overrideLocationMatches(value.override.location, value.manager) &&
    value.override.key === SELECTOR_PACKAGE &&
    typeof value.override.value === 'string' &&
    typeof value.override.owned === 'boolean'
  )
}

function isValidMetadataCollections(value: JsdomOverrideMetadata): boolean {
  return (
    Array.isArray(value.createdMaps) &&
    !value.createdMaps.some(isInvalidCreatedMap) &&
    Array.isArray(value.dependencies) &&
    !value.dependencies.some(isInvalidDependency)
  )
}

function isValidCreatedWorkspaceYaml(value: JsdomOverrideMetadata): boolean {
  return (
    value.createdWorkspaceYaml === undefined ||
    (typeof value.createdWorkspaceYaml === 'object' &&
      value.createdWorkspaceYaml !== null &&
      typeof value.createdWorkspaceYaml.value === 'string')
  )
}

export function storeMetadata(
  packageJson: PackageJson,
  metadata: JsdomOverrideMetadata,
  createdMaps: CreatedMap[],
): void {
  let namespace = asRecord(packageJson['nwsapi'])
  if (!namespace) {
    namespace = {}
    packageJson['nwsapi'] = namespace
    createdMaps.push({ path: 'package.json.nwsapi', value: {} })
  }
  namespace['jsdomOverride'] = metadata
}

export function deleteMetadata(packageJson: PackageJson): void {
  const namespace = asRecord(packageJson['nwsapi'])
  if (namespace) {
    delete namespace['jsdomOverride']
  }
}

export function removeCreatedMaps(
  packageJson: PackageJson,
  yamlFile: WorkspaceYaml | undefined,
  manager: JsdomPackageManager,
  metadata: JsdomOverrideMetadata,
): void {
  for (const created of metadata.createdMaps) {
    if (
      created.path === 'package.json.overrides' &&
      overrideMapIsEmpty(packageJson, yamlFile, manager)
    ) {
      delete packageJson['overrides']
    }
    if (
      created.path === 'package.json.devDependencies' &&
      isEmptyRecord(packageJson['devDependencies'])
    ) {
      delete packageJson['devDependencies']
    }
    if (
      created.path === 'pnpm-workspace.yaml.overrides' &&
      isYamlEmptyMap(yamlFile, 'overrides')
    ) {
      yamlFile?.document.delete('overrides')
    }
  }
}

export function removeCreatedWorkspaceYaml(
  metadata: JsdomOverrideMetadata,
  yamlFile: WorkspaceYaml | undefined,
): boolean {
  const created = metadata.createdWorkspaceYaml
  if (!created || !yamlFile || yamlFile.text !== created.value) {
    return false
  }
  return true
}

export function removeCreatedNamespace(
  packageJson: PackageJson,
  metadata: JsdomOverrideMetadata,
): void {
  if (!createdMap(metadata, 'package.json.nwsapi')) {
    return
  }
  const namespace = asRecord(packageJson['nwsapi'])
  if (namespace && Object.keys(namespace).length === 0) {
    delete packageJson['nwsapi']
  }
}

function createdMap(metadata: JsdomOverrideMetadata, mapPath: string): boolean {
  return metadata.createdMaps.some(created => created.path === mapPath)
}

function isInvalidCreatedMap(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return true
  }
  const entry = value as CreatedMap
  return (
    typeof entry.path !== 'string' ||
    !asRecord(entry.value) ||
    Object.keys(entry.value).length !== 0 ||
    ![
      'package.json.overrides',
      'package.json.devDependencies',
      'package.json.dependencies',
      'package.json.nwsapi',
      'pnpm-workspace.yaml.overrides',
    ].includes(entry.path)
  )
}

function isInvalidDependency(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return true
  }
  const entry = value as JsdomOverrideMetadata['dependencies'][number]
  return (
    !['dependencies', 'devDependencies', 'optionalDependencies'].includes(
      entry.section,
    ) ||
    entry.name !== CSS_TREE_PACKAGE ||
    typeof entry.value !== 'string' ||
    typeof entry.owned !== 'boolean'
  )
}
