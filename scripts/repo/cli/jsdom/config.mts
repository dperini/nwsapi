import type { CreatedMap, JsdomOverrideMetadata } from './types.mts'
import type { JsdomProject, PackageJson } from './project.mts'
import {
  checkNpmDirectDependency,
  dependencyEntries,
  ensureCssTree,
  removeOwnedDependencies,
  requireCompatibleJsdom,
} from './dependencies.mts'
import {
  deleteMetadata,
  readMetadata,
  removeCreatedWorkspaceYaml,
  removeCreatedMaps,
  removeCreatedNamespace,
  validateMetadata,
  storeMetadata,
} from './ownership.mts'
import {
  activeWorkspaceYaml,
  clonePackage,
  packageManagerLocation,
  planChanges,
  CSS_TREE_PACKAGE,
  SELECTOR_PACKAGE,
  type ConfigPlan,
} from './shared.mts'
import {
  checkAlternateOverrides,
  deleteActiveOverride,
  readActiveOverride,
  rejectScopedOverrideConflicts,
  activeOverrideMap,
  setActiveOverride,
} from './overrides.mts'

export function planAdd(
  project: JsdomProject,
  alias: string,
  cssTreeRange: string,
  jsdomRange: string,
): ConfigPlan {
  requireCompatibleJsdom(project, jsdomRange)
  const packageJson = clonePackage(
    project.packageJsonText,
    project.packageJsonPath,
  )
  const existingMetadata = readMetadata(packageJson)
  if (existingMetadata) {
    return planRepeatAdd(
      project,
      packageJson,
      existingMetadata,
      alias,
      cssTreeRange,
    )
  }

  const yamlFile = activeWorkspaceYaml(project, true)
  checkAlternateOverrides(packageJson, yamlFile, project.manager, alias)
  const currentOverride = readActiveOverride(
    packageJson,
    yamlFile,
    project.manager,
  )
  if (currentOverride.exists && currentOverride.value !== alias) {
    throw new Error(
      `A conflicting ${SELECTOR_PACKAGE} override already exists. Remove or update it before running this command.`,
    )
  }
  rejectScopedOverrideConflicts(
    activeOverrideMap(packageJson, yamlFile, project.manager),
  )
  checkNpmDirectDependency(packageJson, project.manager, alias)

  const createdMaps: CreatedMap[] = []
  const overrideMapCreated = setActiveOverride(
    packageJson,
    yamlFile,
    project.manager,
    alias,
  )
  if (overrideMapCreated) {
    createdMaps.push({
      path:
        project.manager === 'npm'
          ? 'package.json.overrides'
          : 'pnpm-workspace.yaml.overrides',
      value: {},
    })
  }
  const jsdomSection =
    dependencyEntries(project.invokingPackageJson, 'jsdom')[0]?.section ??
    'devDependencies'
  const dependencies = ensureCssTree(
    packageJson,
    cssTreeRange,
    createdMaps,
    jsdomSection,
  )
  const metadata: JsdomOverrideMetadata = {
    schemaVersion: 1,
    manager: project.manager,
    override: {
      location: packageManagerLocation(project.manager),
      key: SELECTOR_PACKAGE,
      value: alias,
      owned: !currentOverride.exists,
    },
    createdMaps,
    dependencies,
  }
  if (project.manager === 'pnpm' && yamlFile && !yamlFile.existed) {
    metadata.createdWorkspaceYaml = { value: yamlFile.document.toString() }
  }
  storeMetadata(packageJson, metadata, createdMaps)
  return planChanges(project, packageJson, yamlFile, [
    'Add the jsdom selector override and update the project lockfile.',
  ])
}

export function planRemove(project: JsdomProject): ConfigPlan {
  const packageJson = clonePackage(
    project.packageJsonText,
    project.packageJsonPath,
  )
  const metadata = readMetadata(packageJson)
  if (!metadata) {
    return {
      changes: [],
      messages: [
        'No nwsapi-managed jsdom override is recorded in this project.',
      ],
      hasProvenance: false,
    }
  }
  validateMetadata(metadata)
  if (metadata.manager !== project.manager) {
    throw new Error(
      `The recorded package manager is ${metadata.manager}, but this project now uses ${project.manager}. Restore the original manager before removing the override.`,
    )
  }

  const yamlFile = activeWorkspaceYaml(project)
  const messages: string[] = []
  const currentOverride = readActiveOverride(
    packageJson,
    yamlFile,
    metadata.manager,
  )
  if (
    metadata.override.owned &&
    (!currentOverride.exists ||
      currentOverride.value !== metadata.override.value)
  ) {
    throw new Error(
      `The managed ${SELECTOR_PACKAGE} override changed after it was added. No files were changed.`,
    )
  }
  if (metadata.override.owned) {
    deleteActiveOverride(packageJson, yamlFile, metadata.manager)
  } else {
    messages.push(`Kept the pre-existing ${SELECTOR_PACKAGE} override.`)
  }
  removeOwnedDependencies(packageJson, metadata, messages)
  removeCreatedMaps(packageJson, yamlFile, metadata.manager, metadata)
  const createdYamlRemoved = removeCreatedWorkspaceYaml(metadata, yamlFile)
  deleteMetadata(packageJson)
  removeCreatedNamespace(packageJson, metadata)
  messages.push(
    'Remove the managed jsdom override and update the project lockfile.',
  )
  const plan = planChanges(project, packageJson, yamlFile, messages)
  if (createdYamlRemoved && yamlFile) {
    const change = plan.changes.find(item => item.path === yamlFile.path)
    if (change) {
      change.updated = undefined
    } else {
      plan.changes.push({
        path: yamlFile.path,
        original: yamlFile.text,
        updated: undefined,
      })
    }
  } else if (metadata.createdWorkspaceYaml && yamlFile) {
    messages.push('Kept pnpm-workspace.yaml because it contains later edits.')
  }
  return plan
}

function planRepeatAdd(
  project: JsdomProject,
  packageJson: PackageJson,
  metadata: JsdomOverrideMetadata,
  alias: string,
  cssTreeRange: string,
): ConfigPlan {
  validateMetadata(metadata)
  if (metadata.manager !== project.manager) {
    throw new Error(
      `This project already records a ${metadata.manager} jsdom override. Resolve that state before using ${project.manager}.`,
    )
  }
  if (metadata.override.value !== alias) {
    throw new Error(
      'The recorded override targets a different nwsapi version. Remove it before adding this version.',
    )
  }
  const yamlFile = activeWorkspaceYaml(project)
  const currentOverride = readActiveOverride(
    packageJson,
    yamlFile,
    project.manager,
  )
  if (
    !currentOverride.exists ||
    currentOverride.value !== metadata.override.value
  ) {
    throw new Error(
      `The recorded ${SELECTOR_PACKAGE} override has changed. Restore it or remove the managed override before adding again.`,
    )
  }
  checkAlternateOverrides(packageJson, yamlFile, project.manager, alias)
  rejectScopedOverrideConflicts(
    activeOverrideMap(packageJson, yamlFile, project.manager),
  )
  checkNpmDirectDependency(packageJson, project.manager, alias)
  const cssTree = dependencyEntries(packageJson, CSS_TREE_PACKAGE)
  if (!cssTree.length) {
    throw new Error(
      'The recorded css-tree dependency is missing. Run `nwsapi jsdom remove` and add the override again.',
    )
  }
  const jsdomSection =
    dependencyEntries(project.invokingPackageJson, 'jsdom')[0]?.section ??
    'devDependencies'
  ensureCssTree(packageJson, cssTreeRange, [], jsdomSection)
  return {
    changes: [],
    messages: ['The managed jsdom override is already configured.'],
    hasProvenance: true,
  }
}
