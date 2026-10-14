import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseDocument } from 'yaml'
import type { JsdomPackageManager } from './types.mts'

export type PackageJson = Record<string, unknown> & {
  packageManager?: string
}

export type JsdomProject = {
  root: string
  packageJsonPath: string
  packageJsonText: string
  packageJson: PackageJson
  invokingPackageRoot: string
  invokingPackageJson: PackageJson
  manager: JsdomPackageManager
  workspaceYamlPath?: string
  workspaceYamlText?: string
  workspaceYamlDocument?: ReturnType<typeof parseDocument>
}

const UNSUPPORTED_LOCKS = ['yarn.lock', 'bun.lock', 'bun.lockb', 'deno.lock']

export function resolveProject(
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): JsdomProject {
  const absoluteCwd = path.resolve(cwd)
  rejectManagedDependencyDirectory(absoluteCwd)
  const nearest = nearestPackageRoot(absoluteCwd)
  const invokingPackageJsonPath = path.join(nearest, 'package.json')
  const invokingPackageText = readFileSync(invokingPackageJsonPath, 'utf8')
  const invokingPackageJson = parsePackageJson(
    invokingPackageText,
    invokingPackageJsonPath,
  )
  const workspace = findOwningWorkspace(nearest)
  const root = workspace ?? nearest
  const packageJsonPath = path.join(root, 'package.json')
  const packageJsonText = readFileSync(packageJsonPath, 'utf8')
  const packageJson = parsePackageJson(packageJsonText, packageJsonPath)
  const manager = resolveManager(root, packageJson, env)
  const workspaceFiles = readWorkspaceYaml(root)
  return {
    root,
    packageJsonPath,
    packageJsonText,
    packageJson,
    invokingPackageRoot: nearest,
    invokingPackageJson,
    manager,
    ...workspaceFiles,
  }
}

export function parsePackageJson(text: string, filename: string): PackageJson {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error(`Cannot parse ${filename}: ${errorMessage(error)}`)
  }
  if (!isRecord(value)) {
    throw new Error(`${filename} must contain a JSON object.`)
  }
  return value as PackageJson
}

export function resolveManager(
  root: string,
  pkg: PackageJson,
  env: NodeJS.ProcessEnv,
): JsdomPackageManager {
  const packageManager = packageManagerName(pkg.packageManager)
  const { npmLock, pnpmLock } = projectLockfiles(root)
  validateLockfiles(packageManager, npmLock, pnpmLock)
  const lockManager = npmLock ? 'npm' : pnpmLock ? 'pnpm' : undefined
  validateManagerLock(packageManager, lockManager)
  if (packageManager) {
    return packageManager
  }
  if (lockManager) {
    return lockManager
  }
  const agent = env['npm_config_user_agent']?.trim()
  const invoked = agent?.split(/[/\s]/, 1)[0]?.toLowerCase()
  return invoked === 'pnpm' ? 'pnpm' : 'npm'
}

function projectLockfiles(root: string): {
  npmLock: boolean
  pnpmLock: boolean
} {
  const npmLock =
    existsSync(path.join(root, 'package-lock.json')) ||
    existsSync(path.join(root, 'npm-shrinkwrap.json'))
  const pnpmLock = existsSync(path.join(root, 'pnpm-lock.yaml'))
  const unsupportedLocks = UNSUPPORTED_LOCKS.filter(name =>
    existsSync(path.join(root, name)),
  )
  if (unsupportedLocks.length) {
    throw new Error(
      `The jsdom command does not support ${unsupportedLocks.join(', ')}.`,
    )
  }
  if (npmLock && pnpmLock) {
    throw new Error('This project has both npm and pnpm lockfiles.')
  }
  return { npmLock, pnpmLock }
}

function validateLockfiles(
  manager: JsdomPackageManager | undefined,
  npmLock: boolean,
  pnpmLock: boolean,
): void {
  const lockManager = npmLock ? 'npm' : pnpmLock ? 'pnpm' : undefined
  validateManagerLock(manager, lockManager)
}

function validateManagerLock(
  manager: JsdomPackageManager | undefined,
  lockManager: JsdomPackageManager | undefined,
): void {
  if (manager && lockManager && manager !== lockManager) {
    throw new Error('packageManager conflicts with the project lockfile.')
  }
}

function packageManagerName(value: unknown): JsdomPackageManager | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string') {
    throw new Error('package.json packageManager must be a string.')
  }
  const match = /^(npm|pnpm)(?:@[^@\s]+)?$/i.exec(value)
  const name = match?.[1]?.toLowerCase()
  if (name !== 'npm' && name !== 'pnpm') {
    throw new Error(
      `The jsdom command does not support packageManager ${value}.`,
    )
  }
  return name
}

function nearestPackageRoot(cwd: string): string {
  let directory = cwd
  while (true) {
    const manifest = path.join(directory, 'package.json')
    if (existsSync(manifest)) {
      return directory
    }
    const parent = path.dirname(directory)
    if (parent === directory) {
      throw new Error(`No package.json was found from ${cwd}.`)
    }
    directory = parent
  }
}

function findOwningWorkspace(packageRoot: string): string | undefined {
  let directory = path.dirname(packageRoot)
  while (directory !== path.dirname(directory)) {
    const packageJsonPath = path.join(directory, 'package.json')
    if (existsSync(packageJsonPath)) {
      const text = readFileSync(packageJsonPath, 'utf8')
      const pkg = parsePackageJson(text, packageJsonPath)
      const patterns = workspacePatterns(directory, pkg)
      if (
        patterns &&
        includesPackage(patterns, path.relative(directory, packageRoot))
      ) {
        return directory
      }
    }
    directory = path.dirname(directory)
  }
  return undefined
}

function workspacePatterns(
  root: string,
  pkg: PackageJson,
): string[] | undefined {
  const yamlPath = path.join(root, 'pnpm-workspace.yaml')
  const hasPnpmWorkspace = existsSync(yamlPath)
  const hasNpmWorkspace =
    Array.isArray(pkg['workspaces']) || isRecord(pkg['workspaces'])
  if (!hasPnpmWorkspace && !hasNpmWorkspace) {
    return undefined
  }
  const managerHint = supportedPackageManagerName(pkg.packageManager)
  if (managerHint === 'pnpm' || (!managerHint && !hasNpmWorkspace)) {
    if (!hasPnpmWorkspace) {
      return undefined
    }
    const text = readFileSync(yamlPath, 'utf8')
    let document: ReturnType<typeof parseDocument>
    try {
      document = parseDocument(text)
    } catch (error) {
      throw new Error(`Cannot parse ${yamlPath}: ${errorMessage(error)}`)
    }
    if (document.errors.length) {
      throw new Error(
        `Cannot parse ${yamlPath}: ${document.errors[0]!.message}`,
      )
    }
    const packages = document.get('packages', true)
    const value = packages?.toJSON()
    return stringArray(value, `${yamlPath} packages`)
  }
  const workspaces = pkg['workspaces']
  if (Array.isArray(workspaces)) {
    return stringArray(workspaces, `${root}/package.json workspaces`)
  }
  if (isRecord(workspaces)) {
    return stringArray(
      workspaces['packages'],
      `${root}/package.json workspaces.packages`,
    )
  }
  return undefined
}

function readWorkspaceYaml(
  root: string,
): Pick<
  JsdomProject,
  'workspaceYamlPath' | 'workspaceYamlText' | 'workspaceYamlDocument'
> {
  const filename = path.join(root, 'pnpm-workspace.yaml')
  if (!existsSync(filename)) {
    return {}
  }
  const text = readFileSync(filename, 'utf8')
  const document = parseDocument(text)
  if (document.errors.length) {
    throw new Error(`Cannot parse ${filename}: ${document.errors[0]!.message}`)
  }
  return {
    workspaceYamlPath: filename,
    workspaceYamlText: text,
    workspaceYamlDocument: document,
  }
}

function includesPackage(patterns: string[], relativePath: string): boolean {
  const candidate = relativePath.split(path.sep).join('/')
  let included = false
  for (const pattern of patterns) {
    const excluded = pattern.startsWith('!')
    const normalized = normalizeWorkspacePattern(
      excluded ? pattern.slice(1) : pattern,
    )
    if (path.posix.matchesGlob(candidate, normalized)) {
      included = !excluded
    }
  }
  return included
}

function normalizeWorkspacePattern(pattern: string): string {
  return pattern
    .replaceAll('\\', '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '')
}

function stringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${label} must be an array of strings.`)
  }
  return value as string[]
}

function rejectManagedDependencyDirectory(cwd: string): void {
  const segments = cwd.split(path.sep).map(segment => segment.toLowerCase())
  if (
    segments.includes('node_modules') ||
    segments.some(
      (segment, index) => segment === '.npm' && segments[index + 1] === '_npx',
    )
  ) {
    throw new Error(
      'Run the jsdom command from the project that should own the override.',
    )
  }
}

function supportedPackageManagerName(
  value: unknown,
): JsdomPackageManager | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const name = /^(npm|pnpm)(?:@[^@\s]+)?$/i.exec(value)?.[1]?.toLowerCase()
  return name === 'npm' || name === 'pnpm' ? name : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
