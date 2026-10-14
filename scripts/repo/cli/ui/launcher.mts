import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { prepareNativeCache } from './native/cache.mts'
import type { NativeCache } from './native/cache.mts'

export type TuiRuntime = { command: string; version: string }
type SignalHandler = () => void

export type TuiPreflight = {
  inputIsTTY: boolean
  outputIsTTY: boolean
  columns?: number
  rows?: number
  platform: string
  arch: string
  libc?: string
  env: NodeJS.ProcessEnv
  assetAvailable: boolean
  json?: boolean
}

export function canStartTui(options: TuiPreflight) {
  return (
    options.inputIsTTY &&
    options.outputIsTTY &&
    options.columns !== undefined &&
    options.columns >= 80 &&
    options.rows !== undefined &&
    options.rows >= 24 &&
    options.env['NO_COLOR'] === undefined &&
    options.env['TERM'] !== 'dumb' &&
    !options.json &&
    options.assetAvailable &&
    ['darwin', 'linux', 'win32'].includes(options.platform) &&
    ['x64', 'arm64'].includes(options.arch) &&
    (options.platform !== 'linux' ||
      options.libc === 'glibc' ||
      options.libc === 'musl')
  )
}

export function selectTuiRuntime(
  currentCommand: string,
  explicitCommand: string | undefined,
  probe: (command: string) => TuiRuntime | undefined,
) {
  const current = probe(currentCommand)
  if (current) {
    return current
  }
  if (!explicitCommand || explicitCommand === currentCommand) {
    return undefined
  }
  return probe(explicitCommand)
}

type SignalSource = Pick<NodeJS.Process, 'on' | 'removeListener'>

export type TuiLaunchOptions = {
  spawnChild?: typeof spawn
  signalSource?: SignalSource
  platform?: NodeJS.Platform
  killProcess?: typeof process.kill
  cwd?: string
  env?: NodeJS.ProcessEnv
  prepareCache?: typeof prepareNativeCache
  warn?: (message: string) => void
}

function warnCacheCleanupFailure(warn?: (message: string) => void) {
  try {
    const report = warn ?? console.error
    report('Could not remove temporary OpenTUI files.')
  } catch {}
}

export async function launchTui(
  runtime: TuiRuntime,
  entry: string,
  assetRoot: string,
  options: TuiLaunchOptions = {},
) {
  const platform = options.platform ?? process.platform
  let cache: NativeCache
  try {
    const prepareCache = options.prepareCache ?? prepareNativeCache
    cache = await prepareCache(assetRoot, { platform })
  } catch {
    return 78
  }
  try {
    const spawnChild = options.spawnChild ?? spawn
    const signalSource = options.signalSource ?? process
    const killProcess =
      options.killProcess ?? ((pid, signal) => process.kill(pid, signal))
    let child: ChildProcess
    try {
      child = spawnChild(
        runtime.command,
        [
          ...process.execArgv.filter(
            argument =>
              argument !== '--experimental-ffi' &&
              !argument.startsWith('--inspect') &&
              !argument.startsWith('--debug'),
          ),
          '--experimental-ffi',
          entry,
        ],
        {
          cwd: options.cwd ?? process.cwd(),
          env: {
            ...process.env,
            ...options.env,
            ...cache.env,
            OTUI_ASSET_ROOT: assetRoot,
          },
          stdio: 'inherit',
          detached: platform !== 'win32',
          windowsHide: true,
        },
      )
    } catch {
      return 78
    }
    return await observeChild(child, signalSource, platform, killProcess)
  } finally {
    try {
      await cache.cleanup()
    } catch {
      warnCacheCleanupFailure(options.warn)
    }
  }
}

function observeChild(
  child: ChildProcess,
  signals: SignalSource,
  platform: NodeJS.Platform,
  killProcess: typeof process.kill,
) {
  return new Promise<number>(resolve => {
    let settled = false
    let spawned = false
    const handlers = new Map<NodeJS.Signals, SignalHandler>()
    const cleanup = () => {
      for (const [signal, handler] of handlers) {
        signals.removeListener(signal, handler)
      }
      child.removeListener('spawn', onSpawn)
      child.removeListener('error', onError)
    }
    const finish = (code: number) => {
      if (!settled) {
        settled = true
        cleanup()
        resolve(code)
      }
    }
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      const forward = () => {
        if (child.exitCode === null && child.signalCode === null) {
          if (platform !== 'win32' && child.pid !== undefined) {
            try {
              killProcess(-child.pid, signal)
            } catch (error) {
              if (
                !(
                  error instanceof Error &&
                  'code' in error &&
                  error.code === 'ESRCH'
                )
              ) {
                throw error
              }
            }
          } else {
            child.kill(signal)
          }
        }
      }
      handlers.set(signal, forward)
      signals.on(signal, forward)
    }
    const onSpawn = () => {
      spawned = true
    }
    const onError = () => {
      if (!spawned) {
        finish(78)
      }
    }
    child.on('spawn', onSpawn)
    child.on('error', onError)
    child.once('close', (code, signal) => {
      finish(
        signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : (code ?? 1),
      )
    })
  })
}
