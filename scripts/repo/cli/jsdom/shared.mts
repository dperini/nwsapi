import { isMap, parseDocument } from 'yaml'
import type { FileChange, JsdomPackageManager } from './types.mts'
import {
  parsePackageJson,
  type JsdomProject,
  type PackageJson,
} from './project.mts'

export const SELECTOR_PACKAGE = '@asamuzakjp/dom-selector'
export const CSS_TREE_PACKAGE = 'css-tree'

export type ConfigPlan = {
  changes: FileChange[]
  messages: string[]
  hasProvenance: boolean
}

export type OverrideEntry = { exists: boolean; value?: unknown }

export type WorkspaceYaml = {
  path: string
  text: string
  document: ReturnType<typeof parseDocument>
  existed: boolean
}

export function activeWorkspaceYaml(
  project: JsdomProject,
  create = false,
): WorkspaceYaml | undefined {
  if (
    !project.workspaceYamlPath ||
    project.workspaceYamlText === undefined ||
    !project.workspaceYamlDocument
  ) {
    if (!create || project.manager !== 'pnpm') {
      return undefined
    }
    return {
      path: `${project.root}/pnpm-workspace.yaml`,
      text: '',
      document: parseDocument(''),
      existed: false,
    }
  }
  return {
    path: project.workspaceYamlPath,
    text: project.workspaceYamlText,
    document: parseDocument(project.workspaceYamlText),
    existed: true,
  }
}

export function jsonOverrideMap(
  packageJson: PackageJson,
  key: string,
): Record<string, unknown> | undefined {
  const value = packageJson[key]
  if (value === undefined) {
    return undefined
  }
  const map = asRecord(value)
  if (!map) {
    throw new Error(`package.json ${key} must be a mapping.`)
  }
  return map
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function isEmptyRecord(value: unknown): boolean {
  const record = asRecord(value)
  return Boolean(record && Object.keys(record).length === 0)
}

export function clonePackage(text: string, filename: string): PackageJson {
  return parsePackageJson(text, filename)
}

export function planChanges(
  project: JsdomProject,
  packageJson: PackageJson,
  yamlFile: WorkspaceYaml | undefined,
  messages: string[],
): ConfigPlan {
  const jsonText = formatPackageJson(project.packageJsonText, packageJson)
  const changes: FileChange[] = []
  if (jsonText !== project.packageJsonText) {
    changes.push({
      path: project.packageJsonPath,
      original: project.packageJsonText,
      updated: jsonText,
    })
  }
  if (yamlFile && yamlFile.document.toString() !== yamlFile.text) {
    changes.push({
      path: yamlFile.path,
      original: yamlFile.existed ? yamlFile.text : undefined,
      updated: yamlFile.document.toString(),
    })
  }
  return { changes, messages, hasProvenance: true }
}

export function formatPackageJson(
  original: string,
  packageJson: PackageJson,
): string {
  const indentation = original.match(/\n([ \t]+)"[^"\n]+":/)?.[1] ?? '  '
  const rendered = JSON.stringify(packageJson, null, indentation)
  const lineEnding = original.includes('\r\n') ? '\r\n' : '\n'
  const hadFinalNewline = /(?:\r?\n)$/.test(original)
  const normalized =
    lineEnding === '\n' ? rendered : rendered.replace(/\n/g, lineEnding)
  return `${normalized}${hadFinalNewline ? lineEnding : ''}`
}

export function isYamlEmptyMap(
  yamlFile: WorkspaceYaml | undefined,
  key: string,
): boolean {
  const node = yamlFile?.document.get(key, true)
  return (
    isMap(node) &&
    node.items.length === 0 &&
    !node.comment &&
    !node.commentBefore
  )
}

export function packageManagerLocation(
  manager: JsdomPackageManager,
): 'package.json#overrides' | 'pnpm-workspace.yaml#overrides' {
  return manager === 'npm'
    ? 'package.json#overrides'
    : 'pnpm-workspace.yaml#overrides'
}
