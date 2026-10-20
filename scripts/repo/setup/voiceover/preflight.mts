import { createHash } from 'node:crypto'
import { constants, accessSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { REPO_ROOT } from '../../lib/paths.mts'

export type ProbeState = 'present' | 'missing' | 'unknown'

export interface VoiceOverPreflight {
  platform: NodeJS.Platform
  supported: boolean
  machineSetup: 'ready' | 'needed' | 'unknown' | 'unsupported'
  assets: ProbeState | 'unsupported'
  permissions: 'unverified'
  localPreferences: ProbeState | 'unsupported'
}

interface GuidepupAsset {
  asset: string
  platformVersion?: string
  version: string
  sha256: string
}

interface GuidepupManifest {
  screenReaders: Array<{
    id: string
    platforms: string[]
    assets: GuidepupAsset[]
  }>
}

export interface VoiceOverProbeOptions {
  root?: string
  platform?: NodeJS.Platform
  release?: string
  home?: string
  fileProbe?: (file: string) => ProbeState
  defaultsProbe?: () => ProbeState
  manifestProbe?: () => GuidepupManifest | undefined
  assetProbe?: (file: string, sha256: string) => ProbeState
}

export function preflightVoiceOver(
  options: VoiceOverProbeOptions = {},
): VoiceOverPreflight {
  const platform = options.platform ?? process.platform
  if (platform !== 'darwin') {
    return {
      platform,
      supported: false,
      machineSetup: 'unsupported',
      assets: 'unsupported',
      permissions: 'unverified',
      localPreferences: 'unsupported',
    }
  }
  const release = options.release ?? os.release()
  const home = options.home ?? os.homedir()
  const fileProbe = options.fileProbe ?? probeReadableFile
  const defaultsProbe = options.defaultsProbe ?? probeAppleScriptDefault
  const localPreferences = fileProbe(voiceOverPreferencesPath(release, home))
  const settings = probeMachineSettings(release, home, fileProbe, defaultsProbe)
  const assets = probeVoiceOverAsset(
    options.root ?? REPO_ROOT,
    release,
    options.manifestProbe ??
      (() => readGuidepupManifest(options.root ?? REPO_ROOT)),
    options.assetProbe ?? probeAssetChecksum,
  )
  return {
    platform,
    supported: true,
    machineSetup: settings,
    assets,
    permissions: 'unverified',
    localPreferences,
  }
}

export function probeMachineSettings(
  release: string,
  home: string,
  fileProbe: (file: string) => ProbeState,
  defaultsProbe: () => ProbeState,
): VoiceOverPreflight['machineSetup'] {
  const database = fileProbe(
    '/private/var/db/Accessibility/.VoiceOverAppleScriptEnabled',
  )
  const defaults = defaultsProbe()
  const preferences = fileProbe(voiceOverPreferencesPath(release, home))
  if (database === 'present' && defaults === 'present') {
    return preferences === 'present'
      ? 'ready'
      : preferences === 'missing'
        ? 'needed'
        : 'unknown'
  }
  if (
    database === 'missing' ||
    defaults === 'missing' ||
    preferences === 'missing'
  ) {
    return 'needed'
  }
  return 'unknown'
}

export function voiceOverPreferencesPath(release: string, home: string) {
  const darwinMajor = Number.parseInt(release.split('.')[0] ?? '', 10)
  const directory =
    darwinMajor >= 24
      ? path.join(
          home,
          'Library/Group Containers/group.com.apple.VoiceOver/Library/Preferences',
        )
      : path.join(home, 'Library/Preferences')
  return path.join(directory, 'com.apple.VoiceOver4.local.plist')
}

export function probeReadableFile(file: string): ProbeState {
  try {
    accessSync(file, constants.R_OK)
    return 'present'
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT' ? 'missing' : 'unknown'
  }
}

export function probeAppleScriptDefault(): ProbeState {
  try {
    const value = execFileSync(
      'defaults',
      ['read', 'com.apple.VoiceOver4/default', 'SCREnableAppleScript'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim()
    return value === '1' ? 'present' : 'missing'
  } catch (error) {
    const stderr = (
      error as NodeJS.ErrnoException & { stderr?: Buffer | string }
    ).stderr
    const message = Buffer.isBuffer(stderr) ? stderr.toString() : (stderr ?? '')
    return /does not exist|not found/i.test(message) ? 'missing' : 'unknown'
  }
}

export function readGuidepupManifest(
  root: string,
): GuidepupManifest | undefined {
  try {
    const require = createRequire(path.join(root, 'package.json'))
    const packagePath = require.resolve('@guidepup/guidepup/package.json')
    const manifestPath = path.join(path.dirname(packagePath), 'manifest.json')
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as GuidepupManifest
  } catch {
    return undefined
  }
}

export function probeVoiceOverAsset(
  root: string,
  release: string,
  manifestProbe: () => GuidepupManifest | undefined,
  assetProbe: (file: string, sha256: string) => ProbeState,
): ProbeState {
  const manifest = manifestProbe()
  const major = release.split('.')[0]
  const reader = manifest?.screenReaders.find(
    candidate =>
      candidate.id === 'voiceover' && candidate.platforms.includes('darwin'),
  )
  const asset = reader?.assets.find(
    candidate =>
      !candidate.platformVersion || candidate.platformVersion === major,
  )
  if (!asset) {
    return 'unknown'
  }
  const file = path.join(
    root,
    '.cache/guidepup/voiceover',
    asset.platformVersion ?? 'all',
    asset.version,
    asset.asset,
  )
  return assetProbe(file, asset.sha256)
}

export function probeAssetChecksum(file: string, expected: string): ProbeState {
  try {
    const actual = createHash('sha256').update(readFileSync(file)).digest('hex')
    return actual === expected ? 'present' : 'missing'
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'ENOENT' ? 'missing' : 'unknown'
  }
}
