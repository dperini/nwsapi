import { subset, validRange } from 'semver'
import type {
  CreatedMap,
  DependencySection,
  JsdomOverrideMetadata,
  JsdomPackageManager,
} from './types.mts'
import type { JsdomProject, PackageJson } from './project.mts'
import { CSS_TREE_PACKAGE, SELECTOR_PACKAGE, asRecord } from './shared.mts'

export function requireCompatibleJsdom(
  project: JsdomProject,
  peerRange: string,
): void {
  const entries = dependencyEntries(project.invokingPackageJson, 'jsdom')
  if (!entries.length && project.invokingPackageRoot !== project.root) {
    entries.push(...dependencyEntries(project.packageJson, 'jsdom'))
  }
  if (!entries.length) {
    throw new Error(
      `This project does not declare jsdom. Add jsdom ${peerRange} with its package manager, then retry.`,
    )
  }
  requireCompatibleDependency(entries, peerRange)
}

export function ensureCssTree(
  packageJson: PackageJson,
  peerRange: string,
  createdMaps: CreatedMap[],
  jsdomSection: DependencySection,
): JsdomOverrideMetadata['dependencies'] {
  const existing = dependencyEntries(packageJson, CSS_TREE_PACKAGE)
  if (existing.length) {
    requireCompatibleDependency(existing, peerRange)
    return existing.map(entry => ({
      section: entry.section,
      name: CSS_TREE_PACKAGE,
      value: entry.value,
      owned: false,
    }))
  }
  const section =
    jsdomSection === 'dependencies' || jsdomSection === 'optionalDependencies'
      ? 'dependencies'
      : 'devDependencies'
  let dependencies = asRecord(packageJson[section])
  if (!dependencies) {
    dependencies = {}
    packageJson[section] = dependencies
    createdMaps.push({ path: `package.json.${section}`, value: {} })
  }
  dependencies[CSS_TREE_PACKAGE] = peerRange
  return [
    {
      section,
      name: CSS_TREE_PACKAGE,
      value: peerRange,
      owned: true,
    },
  ]
}

export function dependencyEntries(
  packageJson: PackageJson,
  name: string,
): Array<{ section: DependencySection; value: string }> {
  const sections: DependencySection[] = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
  ]
  const entries: Array<{ section: DependencySection; value: string }> = []
  for (const section of sections) {
    const declarations = asRecord(packageJson[section])
    if (declarations && Object.hasOwn(declarations, name)) {
      const value = declarations[name]
      if (typeof value !== 'string') {
        throw new Error(`${section}.${name} must be a string.`)
      }
      entries.push({ section, value })
    }
  }
  return entries
}

export function checkNpmDirectDependency(
  packageJson: PackageJson,
  manager: JsdomPackageManager,
  alias: string,
): void {
  if (manager !== 'npm') {
    return
  }
  const declarations = dependencyEntries(packageJson, SELECTOR_PACKAGE)
  if (declarations.some(entry => entry.value !== alias)) {
    throw new Error(
      `npm cannot override the direct ${SELECTOR_PACKAGE} dependency with a different spec (EOVERRIDE). Update that dependency yourself, then retry.`,
    )
  }
}

export function removeOwnedDependencies(
  packageJson: PackageJson,
  metadata: JsdomOverrideMetadata,
  messages: string[],
): void {
  for (const entry of metadata.dependencies) {
    const declarations = asRecord(packageJson[entry.section])
    if (!declarations || !Object.hasOwn(declarations, entry.name)) {
      if (entry.owned) {
        messages.push(
          `Kept ${entry.section}.${entry.name}; it was already removed.`,
        )
      }
      continue
    }
    if (!entry.owned) {
      messages.push(`Kept the pre-existing ${entry.name} dependency.`)
      continue
    }
    if (declarations[entry.name] !== entry.value) {
      messages.push(
        `Kept the user-modified ${entry.section}.${entry.name} dependency.`,
      )
      continue
    }
    delete declarations[entry.name]
  }
}

export function requireCompatibleDependency(
  entries: Array<{ section: DependencySection; value: string }>,
  requiredRange: string,
): void {
  for (const entry of entries) {
    const range = validRange(entry.value)
    if (!range) {
      throw new Error(
        `${entry.section} declares ${entry.value}, which cannot be checked against ${requiredRange}.`,
      )
    }
    if (!subset(range, requiredRange)) {
      throw new Error(
        `${entry.section} declares ${entry.value}, which is not restricted to nwsapi's compatible range ${requiredRange}.`,
      )
    }
  }
}
