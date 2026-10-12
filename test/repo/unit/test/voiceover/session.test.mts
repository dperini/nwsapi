import { expect, test, vi } from 'vitest'
import {
  runNarrationSession,
  type SessionRuntime,
  type WorkerHandle,
  type WorkerOutcome,
} from '../../../../../scripts/repo/test/voiceover/session.mts'
import type { PreferenceSnapshot } from '../../../../../scripts/repo/test/voiceover/snapshot.mts'

const url =
  'http://127.0.0.1:5173/model-guide-reading.html?doc=docs/repo/selector/api.md'
const snapshot = {
  schemaVersion: 1,
  id: 'fixture',
  createdAt: '2026-10-12T00:00:00.000Z',
  root: '/tmp/voiceover-fixture/fixture',
  home: '/tmp/home',
  release: '24.0.0',
  nodes: [],
} as unknown as PreferenceSnapshot

test('refuses active VoiceOver before taking a snapshot or starting worker', async () => {
  const runtime = fakeRuntime({ probe: 'running' })
  const result = await runNarrationSession({ url, runtime })
  expect(result.status).toBe('failed')
  expect(runtime.createSnapshot).not.toHaveBeenCalled()
  expect(runtime.startWorker).not.toHaveBeenCalled()
  expect(runtime.restore).not.toHaveBeenCalled()
})

test('restores only after a stopped, detached session and records evidence', async () => {
  const evidence = {
    action: 'moveCursorToKeyboardFocus',
    pageUrl: url,
    phrases: ['Reading mode'],
  }
  const runtime = fakeRuntime({
    outcome: { status: 0, signal: null, started: true, evidence },
  })
  const result = await runNarrationSession({ url, runtime })
  expect(result.status).toBe('captured')
  expect(runtime.stopVoiceOver).toHaveBeenCalledOnce()
  expect(runtime.verifyVoiceOverStopped).toHaveBeenCalledOnce()
  expect(runtime.detachGuidepupVolume).toHaveBeenCalledOnce()
  expect(runtime.restore).toHaveBeenCalledWith(snapshot)
  expect(runtime.saveEvidence).toHaveBeenCalledWith(snapshot, evidence)
  expect(runtime.removeSnapshot).toHaveBeenCalledOnce()
})

test('preserves lock and snapshot when stop cannot be confirmed', async () => {
  const runtime = fakeRuntime({
    outcome: { status: 1, signal: null, started: true },
    stopped: false,
  })
  const result = await runNarrationSession({ url, runtime })
  expect(result.status).toBe('incomplete')
  expect(result.recoveryPath).toBe(snapshot.root)
  expect(runtime.restore).not.toHaveBeenCalled()
  expect(runtime.removeSnapshot).not.toHaveBeenCalled()
  expect(runtime.lockRelease).not.toHaveBeenCalled()
})

function fakeRuntime(
  options: {
    probe?: 'running' | 'stopped' | 'unknown'
    stopped?: boolean
    outcome?: WorkerOutcome
  } = {},
) {
  const outcome = options.outcome ?? { status: 0, signal: null, started: false }
  const worker: WorkerHandle = {
    wait: vi.fn(async () => outcome),
    terminate: vi.fn(),
    kill: vi.fn(),
    killOwnedBrowser: vi.fn(),
  }
  const lockRelease = vi.fn(async () => {})
  let volumeReads = 0
  const runtime: SessionRuntime & { lockRelease: typeof lockRelease } = {
    lockRelease,
    acquireLock: vi.fn(async () => ({ release: lockRelease })),
    probeVoiceOver: vi.fn(async () => options.probe ?? 'stopped'),
    guidepupVolume: vi.fn(async () => {
      volumeReads += 1
      return volumeReads === 2 ? '/dev/diskFixture' : undefined
    }),
    createSnapshot: vi.fn(async () => snapshot),
    startWorker: vi.fn((_snapshot, _url, onStarted) => {
      if (outcome.started) {
        onStarted()
      }
      return worker
    }),
    stopVoiceOver: vi.fn(async () => {}),
    verifyVoiceOverStopped: vi.fn(async () => options.stopped ?? true),
    detachGuidepupVolume: vi.fn(async () => true),
    restore: vi.fn(async () => {}),
    saveEvidence: vi.fn(async () => '/tmp/evidence.json'),
    removeSnapshot: vi.fn(async () => {}),
    onSignal: vi.fn(() => () => {}),
    delay: vi.fn(async () => {}),
  }
  return runtime
}
