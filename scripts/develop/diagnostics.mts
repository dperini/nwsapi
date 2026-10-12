import { spawnSync } from 'node:child_process'
import {
  accessSync,
  constants,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs'
import path from 'node:path'

export function resolveExecutable(name: string, env = process.env) {
  const extensions =
    process.platform === 'win32'
      ? ['', ...(env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';')]
      : ['']
  for (const [index, entry] of (env['PATH'] ?? '')
    .split(path.delimiter)
    .entries()) {
    for (const extension of extensions) {
      const executable = path.resolve(entry, name + extension)
      try {
        accessSync(
          executable,
          process.platform === 'win32' ? constants.F_OK : constants.X_OK,
        )
        if (statSync(executable).isFile()) {
          return { executable, pathEntry: index + 1 }
        }
      } catch {
        // Continue to the next PATH entry when this one is unavailable.
      }
    }
  }
  return undefined
}

export function executableOwner(
  executable: string,
  resolved: string,
  toolBin: string,
) {
  if (path.dirname(executable) === toolBin) {
    return 'checkout'
  }
  const owners = [
    ['/.nvm/', 'nvm'],
    ['/.local/share/mise/', 'mise'],
    ['/.local/share/fnm/', 'fnm'],
    ['/fnm_multishells/', 'fnm'],
    ['/.volta/', 'Volta'],
    ['/.asdf/', 'asdf'],
    ['/opt/homebrew/', 'Homebrew'],
    ['/Cellar/', 'Homebrew'],
  ]
  const normalized = resolved.replaceAll('\\', '/')
  return (
    owners.find(([pattern]) => normalized.includes(pattern!))?.[1] ??
    'external (owner unknown)'
  )
}

export function activeTool(
  name: string,
  repoRoot: string,
  toolBin: string,
  env = process.env,
) {
  const location = resolveExecutable(name, env)
  if (!location) {
    return {
      name,
      executable: undefined,
      resolved: undefined,
      owner: 'not found',
      version: undefined,
      pathEntry: undefined,
    }
  }
  let resolved = location.executable
  try {
    resolved = realpathSync(location.executable)
  } catch {
    // Preserve the PATH entry when its target cannot be inspected.
  }
  const windowsScript =
    process.platform === 'win32' && /\.(cmd|bat)$/i.test(location.executable)
  const result = spawnSync(
    windowsScript ? 'cmd.exe' : location.executable,
    windowsScript
      ? ['/d', '/s', '/c', `""${location.executable}" --version"`]
      : ['--version'],
    {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
      timeout: 5000,
      killSignal: 'SIGKILL',
      windowsHide: true,
      windowsVerbatimArguments: windowsScript,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  return {
    name,
    ...location,
    resolved,
    owner: executableOwner(location.executable, resolved, toolBin),
    version:
      result.status === 0
        ? result.stdout.trim().match(/^v?(\d+\.\d+\.\d+)$/)?.[1]
        : undefined,
  }
}

interface PackageMetadata {
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export function dependencyReport(repoRoot: string) {
  const issues: string[] = []
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    ) as PackageMetadata
    const lock = JSON.parse(
      readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'),
    ) as {
      packages: Record<string, PackageMetadata>
    }
    for (const group of ['dependencies', 'devDependencies'] as const) {
      for (const [name, requested] of Object.entries(manifest[group] ?? {})) {
        const expected = lock.packages[`node_modules/${name}`]?.version
        if (!expected || lock.packages['']?.[group]?.[name] !== requested) {
          issues.push(`${name}: package.json and package-lock.json disagree`)
          continue
        }
        let actual: string | undefined
        try {
          actual = JSON.parse(
            readFileSync(
              path.join(repoRoot, 'node_modules', name, 'package.json'),
              'utf8',
            ),
          ).version
        } catch {
          // A missing or unreadable package needs dependency setup.
        }
        if (actual !== expected) {
          issues.push(
            `${name}: expected ${expected}, found ${actual ?? 'missing'}`,
          )
        }
      }
    }
  } catch {
    issues.push('Could not read package.json and package-lock.json')
  }
  return { ready: issues.length === 0, issues }
}
