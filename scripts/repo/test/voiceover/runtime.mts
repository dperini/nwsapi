import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { REPO_ROOT } from '../../lib/paths.mts'
import {
  controlVoiceOver,
  voiceOverState,
} from '../../develop/voiceover/control.mts'
import { acquireSessionLock } from './lock.mts'
import { createWorkerChannel } from './channel.mts'
import { runNarrationSession } from './session.mts'
import type {
  NarrationEvidence,
  SessionRuntime,
  WorkerHandle,
  WorkerOutcome,
} from './session.mts'
import {
  createPreferenceSnapshot,
  restorePreferenceSnapshot,
} from './snapshot.mts'
import type { PreferenceSnapshot } from './snapshot.mts'

const mountPoint = '/Volumes/GuidepupVoiceOverPreferences'
const require = createRequire(import.meta.url)
const guidepupAssets = path.join(REPO_ROOT, '.cache/guidepup')

export function showNarrationStatus(write = console.log) {
  write(
    'VoiceOver narration is opt-in and uses the local API reader page only.',
  )
  write(
    'Start an existing local guide server, then run the explicit session command.',
  )
  write(
    'Usage: node scripts/repo/test/voiceover/run.mts --start-session --url http://127.0.0.1:<port>/model-guide-reading.html?doc=docs/repo/selector/api.md',
  )
  write('Stop with Ctrl+C. No session starts from status or help.')
}

export async function runLiveNarration(
  url: string,
  progress: (message: string) => void,
) {
  const result = await runNarrationSession({
    url,
    progress,
    runtime: createRuntime(),
  })
  const write = result.status === 'captured' ? console.log : console.error
  write(result.message)
  return result.exitCode
}

export function createRuntime(): SessionRuntime {
  const backupRoot = path.join(REPO_ROOT, '.cache/voiceover')
  const workerScript = path.join(
    REPO_ROOT,
    'scripts/repo/test/voiceover/worker.mts',
  )
  const lock = () => acquireSessionLock()
  const volume = async () => readGuidepupVolume()
  return {
    acquireLock: lock,
    probeVoiceOver: async () => voiceOverState(),
    guidepupVolume: volume,
    createSnapshot: async () => {
      await mkdir(backupRoot, { recursive: true, mode: 0o700 })
      return createPreferenceSnapshot({
        home: os.homedir(),
        release: os.release(),
        backupRoot,
      })
    },
    startWorker: (snapshot, url, onStarted, onBrowserStarted, authorizeStart) =>
      startWorkerProcess(
        workerScript,
        url,
        snapshot,
        onStarted,
        onBrowserStarted,
        authorizeStart,
        guidepupAssets,
      ),
    stopVoiceOver: async () => {
      const result = await controlVoiceOver('stop', 'running')
      if (result.status !== 0) {
        throw new Error(result.message)
      }
    },
    verifyVoiceOverStopped: async () => voiceOverState() === 'stopped',
    detachGuidepupVolume: async () => detachMountedVolume(),
    restore: snapshot =>
      restorePreferenceSnapshot(snapshot, {
        home: os.homedir(),
        release: os.release(),
      }),
    saveEvidence: saveEvidenceArtifact,
    removeSnapshot: removeSnapshotDirectory,
    onSignal: subscribeSignals,
    delay: milliseconds =>
      new Promise(resolve => setTimeout(resolve, milliseconds)),
  }
}

function startWorkerProcess(
  workerScript: string,
  url: string,
  _snapshot: PreferenceSnapshot,
  onStarted: () => void,
  onBrowserStarted: (pid: number) => void,
  authorizeStart: () => Promise<boolean>,
  assetDirectory: string,
): WorkerHandle {
  const nonce = randomUUID()
  const env = { ...process.env, GUIDEPUP_SCREEN_READERS_PATH: assetDirectory }
  const child = spawn(
    process.execPath,
    [workerScript, '--url', url, '--nonce', nonce],
    {
      cwd: REPO_ROOT,
      env,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  let text = ''
  let result: WorkerOutcome | undefined
  let inputFailure: string | undefined
  let inputEscalation: ReturnType<typeof setTimeout> | undefined
  let browserPid: number | undefined
  let browserClosed = false
  const abortInput = (signal: NodeJS.Signals) => {
    try {
      killWorker(child, signal)
    } catch {
      inputFailure =
        'The narration worker input failed and shutdown is uncertain.'
    }
  }
  const send = createWorkerChannel(
    child.stdin,
    () => child.exitCode === null && child.signalCode === null,
    () => {
      inputFailure = 'The narration worker input closed unexpectedly.'
      abortInput('SIGTERM')
      inputEscalation = setTimeout(() => abortInput('SIGKILL'), 1000)
      inputEscalation.unref()
    },
  )
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    text += chunk
    if (text.length > 128_000) {
      killWorker(child, 'SIGTERM')
      return
    }
    text = parseMessages(text, message => {
      if (message.event === 'browser') {
        const pid = Number(message.pid)
        if (Number.isSafeInteger(pid) && pid > 1) {
          browserPid = pid
          onBrowserStarted(pid)
        }
      }
      if (message.event === 'browser-closed') {
        browserClosed = true
        browserPid = undefined
      }
      if (message.event === 'start-attempt') {
        void authorizeStart()
          .then(allowed => {
            if (allowed) {
              onStarted()
              send(`START:${nonce}`)
            } else {
              killWorker(child, 'SIGTERM')
            }
          })
          .catch(() => killWorker(child, 'SIGTERM'))
      }
      if (message.event === 'result') {
        result = message.result as WorkerOutcome
      }
    })
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => process.stderr.write(chunk))
  const closed = new Promise<WorkerOutcome>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      clearTimeout(inputEscalation)
      resolve(
        inputFailure
          ? {
              status: 1,
              signal,
              started: false,
              error: inputFailure,
            }
          : (result ?? {
              status: code,
              signal,
              started: false,
              error: 'The narration worker exited without a result record.',
            }),
      )
    })
  })
  send(`GO:${nonce}`)
  return {
    wait: () => closed,
    terminate: () => killWorker(child, 'SIGTERM'),
    kill: () => killWorker(child, 'SIGKILL'),
    killOwnedBrowser: () => {
      if (browserPid && !browserClosed) {
        try {
          process.kill(-browserPid, 'SIGKILL')
          return
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
            throw error
          }
        }
        killProcess(browserPid, 'SIGKILL')
      }
    },
  }
}

function parseMessages(
  buffer: string,
  receive: (message: {
    event?: string
    result?: WorkerOutcome
    pid?: number
  }) => void,
) {
  const lines = buffer.split('\n')
  const remainder = lines.pop() ?? ''
  for (const line of lines) {
    try {
      receive(
        JSON.parse(line) as {
          event?: string
          result?: WorkerOutcome
          pid?: number
        },
      )
    } catch {
      process.stderr.write('Narration worker returned an invalid message.\n')
    }
  }
  return remainder
}

function killWorker(child: ReturnType<typeof spawn>, signal: NodeJS.Signals) {
  if (process.platform !== 'win32' && child.pid) {
    killProcess(-child.pid, signal)
    return
  }
  child.kill(signal)
}

function killProcess(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error
    }
  }
}

function readGuidepupVolume(): string | undefined {
  const xml = execFileSync('/usr/bin/hdiutil', ['info', '-plist'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 3000,
    killSignal: 'SIGKILL',
  })
  if (!xml.includes('<plist') || !xml.includes('</plist>')) {
    throw new Error('Could not read the mounted disk image inventory.')
  }
  const json = execFileSync(
    '/usr/bin/plutil',
    ['-convert', 'json', '-o', '-', '-'],
    {
      input: xml,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000,
      killSignal: 'SIGKILL',
    },
  )
  const inventory = JSON.parse(json) as {
    images?: Array<{
      'image-path'?: string
      'system-entities'?: Array<{
        'mount-point'?: string
        'dev-entry'?: string
      }>
    }>
  }
  for (const image of inventory.images ?? []) {
    const entity = image['system-entities']?.find(
      candidate => candidate['mount-point'] === mountPoint,
    )
    if (!entity) {
      continue
    }
    const assetPath = image['image-path']
    const device = entity['dev-entry']
    if (
      !assetPath ||
      path.resolve(assetPath) !== expectedVoiceOverImage() ||
      !device?.startsWith('/dev/disk')
    ) {
      throw new Error('The Guidepup mount identity is uncertain.')
    }
    return device
  }
  return undefined
}

function expectedVoiceOverImage() {
  const manifestPath = path.resolve(
    path.dirname(require.resolve('@guidepup/guidepup')),
    '../manifest.json',
  )
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    screenReaders?: Array<{
      id: string
      assets?: Array<{
        platformVersion: string
        version: string
        asset: string
      }>
    }>
  }
  const platformVersion = os.release().split('.')[0]
  const voiceOver = manifest.screenReaders?.find(
    reader => reader.id === 'voiceover',
  )
  const asset = voiceOver?.assets?.find(
    item => item.platformVersion === platformVersion,
  )
  if (!asset) {
    throw new Error('The installed Guidepup manifest has no matching asset.')
  }
  return path.resolve(
    guidepupAssets,
    'voiceover',
    asset.platformVersion,
    asset.version,
    asset.asset,
  )
}

async function detachMountedVolume() {
  const device = readGuidepupVolume()
  if (!device) {
    return true
  }
  execFileSync('/usr/bin/hdiutil', ['detach', device], {
    stdio: 'ignore',
    timeout: 10_000,
    killSignal: 'SIGKILL',
  })
  return readGuidepupVolume() === undefined
}

async function saveEvidenceArtifact(
  snapshot: PreferenceSnapshot,
  evidence: NarrationEvidence,
) {
  const evidenceRoot = path.join(path.dirname(snapshot.root), 'evidence')
  await mkdir(evidenceRoot, { recursive: true, mode: 0o700 })
  const file = path.join(evidenceRoot, `${snapshot.id}.json`)
  const clean = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    action: evidence.action,
    pageUrl: evidence.pageUrl,
    phrases: evidence.phrases.slice(0, 5).map(phrase => phrase.slice(0, 300)),
  }
  await writeFile(file, JSON.stringify(clean, null, 2), {
    mode: 0o600,
    flag: 'wx',
  })
  return file
}

async function removeSnapshotDirectory(snapshot: PreferenceSnapshot) {
  await rm(snapshot.root, { recursive: true, force: false })
}

function subscribeSignals(handler: (signal: string) => void) {
  const interrupt = () => handler('SIGINT')
  const terminate = () => handler('SIGTERM')
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', terminate)
  return () => {
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', terminate)
  }
}
