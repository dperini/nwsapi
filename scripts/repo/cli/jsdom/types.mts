export type JsdomPackageManager = 'npm' | 'pnpm'
export type DependencySection =
  | 'dependencies'
  | 'devDependencies'
  | 'optionalDependencies'

export type JsdomOverrideMetadata = {
  schemaVersion: 1
  manager: JsdomPackageManager
  override: {
    location: 'package.json#overrides' | 'pnpm-workspace.yaml#overrides'
    key: string
    value: string
    owned: boolean
  }
  createdMaps: Array<{ path: string; value: Record<string, unknown> }>
  dependencies: Array<{
    section: DependencySection
    name: string
    value: string
    owned: boolean
  }>
  createdWorkspaceYaml?: { value: string }
}

export type FileChange = {
  path: string
  original: string | undefined
  updated: string | undefined
}

export type CreatedMap = {
  path: string
  value: Record<string, unknown>
}

export type JsdomOptions = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  install?: PackageInstaller
}

export type PackageInstallRequest = {
  manager: JsdomPackageManager
  cwd: string
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
}

export type PackageInstaller = (request: PackageInstallRequest) => void
