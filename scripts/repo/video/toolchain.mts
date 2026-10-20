import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { REPO_ROOT } from '../lib/paths.mts'

export function supportsVideo(executable: string) {
  const result = spawnSync(executable, ['--version'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  const match = /^cargo (\d+)\.(\d+)\./.exec(result.stdout ?? '')
  return result.status === 0 && match && (+match[1]! > 1 || +match[2]! >= 98)
}

export function rustupCargo() {
  const suffix = process.platform === 'win32' ? '.exe' : ''
  const local = path.join(homedir(), '.cargo', 'bin', `rustup${suffix}`)
  const result = spawnSync(
    existsSync(local) ? local : 'rustup',
    ['which', '--toolchain', 'stable', 'cargo'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  return result.status === 0 ? result.stdout.trim() : undefined
}

export function nativeEnvironment() {
  if (process.platform !== 'darwin' || process.env['SDKROOT']) {
    return {}
  }
  const result = spawnSync('xcrun', ['--show-sdk-path'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  return result.status === 0 ? { SDKROOT: result.stdout.trim() } : {}
}

export function videoEnvironment() {
  const requested = process.env['CARGO']
  if (requested && !supportsVideo(requested)) {
    throw new Error('CARGO must point to Cargo 1.98 or newer.')
  }
  const cargo = requested ?? (supportsVideo('cargo') ? 'cargo' : rustupCargo())
  if (!cargo || !supportsVideo(cargo)) {
    throw new Error(
      'Video rendering needs Rust/Cargo 1.98+. Install a compatible toolchain, ' +
        'or set CARGO to an existing executable. Setup does not change global tools.',
    )
  }
  return {
    cargo,
    env: {
      ...process.env,
      ...nativeEnvironment(),
      ...(path.isAbsolute(cargo)
        ? {
            PATH: `${path.dirname(cargo)}${path.delimiter}${process.env['PATH'] ?? ''}`,
          }
        : {}),
      CARGO_TARGET_DIR: path.join(REPO_ROOT, '.cache', 'fframes', 'target'),
      CARGO_PROFILE_RELEASE_STRIP: 'none',
    },
  }
}
