import { afterEach, expect, test, vi } from 'vitest'
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

afterEach(() => {
  vi.useRealTimers()
})

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

test('a stalled startup is killed by the fake-clock deadline before restoration', async () => {
  vi.useFakeTimers()
  const runtime = fakeRuntime({
    outcome: { status: 1, signal: null, started: true },
  })
  const closed = deferredOutcome()
  runtime.worker.wait.mockReturnValue(closed.promise)
  runtime.worker.kill.mockImplementation(() =>
    closed.resolve({ status: null, signal: 'SIGKILL', started: true }),
  )
  runtime.delay.mockImplementation(
    milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  )
  const pending = runNarrationSession({
    url,
    runtime,
    timeoutMs: 20,
    stopGraceMs: 5,
  })
  await vi.advanceTimersByTimeAsync(30)
  const result = await pending
  expect(result.status).toBe('failed')
  expect(runtime.worker.terminate).toHaveBeenCalledOnce()
  expect(runtime.worker.kill).toHaveBeenCalled()
  expect(runtime.stopVoiceOver).toHaveBeenCalledOnce()
  expect(runtime.restore).toHaveBeenCalledOnce()
  expect(runtime.worker.kill.mock.invocationCallOrder[0]!).toBeLessThan(
    runtime.restore.mock.invocationCallOrder[0]!,
  )
})

test('SIGINT cancels through mocked controls and removes its listener', async () => {
  vi.useFakeTimers()
  const runtime = fakeRuntime({
    outcome: { status: 1, signal: null, started: true },
  })
  const closed = deferredOutcome()
  runtime.worker.wait.mockReturnValue(closed.promise)
  runtime.worker.terminate.mockImplementation(() =>
    closed.resolve({ status: null, signal: 'SIGTERM', started: true }),
  )
  let interrupt = (_signal: string) => {}
  const unsubscribe = vi.fn()
  runtime.onSignal.mockImplementation(handler => {
    interrupt = handler
    return unsubscribe
  })
  const pending = runNarrationSession({ url, runtime })
  await vi.advanceTimersByTimeAsync(0)
  interrupt('SIGINT')
  const result = await pending
  expect(result.status).toBe('failed')
  expect(runtime.worker.terminate).toHaveBeenCalledOnce()
  expect(runtime.restore).toHaveBeenCalledOnce()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

test('an undefined startup rejection still stops and restores the owned session', async () => {
  const runtime = fakeRuntime({
    outcome: { status: 1, signal: null, started: true },
  })
  runtime.worker.wait.mockRejectedValue(undefined)
  const result = await runNarrationSession({ url, runtime })
  expect(result.status).toBe('failed')
  expect(runtime.stopVoiceOver).toHaveBeenCalledOnce()
  expect(runtime.restore).toHaveBeenCalledOnce()
})

test.each(['detach', 'restore'] as const)(
  'a %s failure preserves recovery data and ownership',
  async failure => {
    const runtime = fakeRuntime({
      outcome: { status: 1, signal: null, started: true },
    })
    if (failure === 'detach') {
      runtime.detachGuidepupVolume.mockResolvedValue(false)
    } else {
      runtime.restore.mockRejectedValue(new Error('fixture restore failure'))
    }
    const result = await runNarrationSession({ url, runtime })
    expect(result.status).toBe('incomplete')
    expect(runtime.removeSnapshot).not.toHaveBeenCalled()
    expect(runtime.lockRelease).not.toHaveBeenCalled()
    if (failure === 'detach') {
      expect(runtime.restore).not.toHaveBeenCalled()
    }
  },
)

test('failure before startup never rewrites preferences or stops an unrelated reader', async () => {
  const runtime = fakeRuntime({
    outcome: { status: 1, signal: null, started: false },
  })
  runtime.guidepupVolume.mockResolvedValue(undefined)
  const result = await runNarrationSession({ url, runtime })
  expect(result.status).toBe('failed')
  expect(runtime.stopVoiceOver).not.toHaveBeenCalled()
  expect(runtime.restore).not.toHaveBeenCalled()
  expect(runtime.removeSnapshot).toHaveBeenCalledOnce()
  expect(runtime.lockRelease).toHaveBeenCalledOnce()
})

test('a partial snapshot failure never authorizes worker startup', async () => {
  const runtime = fakeRuntime()
  runtime.createSnapshot.mockRejectedValue(new Error('fixture EPERM'))
  const result = await runNarrationSession({ url, runtime })
  expect(result.status).toBe('failed')
  expect(runtime.startWorker).not.toHaveBeenCalled()
  expect(runtime.restore).not.toHaveBeenCalled()
  expect(runtime.lockRelease).toHaveBeenCalledOnce()
})

test('restoration follows confirmed shutdown and volume detach', async () => {
  const runtime = fakeRuntime({
    outcome: { status: 1, signal: null, started: true },
  })
  await runNarrationSession({ url, runtime })
  const calls = [
    runtime.stopVoiceOver,
    runtime.verifyVoiceOverStopped,
    runtime.detachGuidepupVolume,
    runtime.restore,
  ].map(mock => mock.mock.invocationCallOrder[0]!)
  expect(calls).toEqual(calls.toSorted((left, right) => left - right))
  expect(calls).toHaveLength(4)
})

function deferredOutcome() {
  let resolve!: (value: WorkerOutcome) => void
  const promise = new Promise<WorkerOutcome>(complete => {
    resolve = complete
  })
  return { promise, resolve }
}

function fakeRuntime(
  options: {
    probe?: 'running' | 'stopped' | 'unknown'
    stopped?: boolean
    outcome?: WorkerOutcome
  } = {},
) {
  const outcome = options.outcome ?? { status: 0, signal: null, started: false }
  const worker = {
    wait: vi.fn<WorkerHandle['wait']>(async () => outcome),
    terminate: vi.fn<WorkerHandle['terminate']>(),
    kill: vi.fn<WorkerHandle['kill']>(),
    killOwnedBrowser: vi.fn<WorkerHandle['killOwnedBrowser']>(),
  } satisfies WorkerHandle
  const lockRelease = vi.fn(async () => {})
  let volumeReads = 0
  const runtime = {
    acquireLock: vi.fn(async () => ({ release: lockRelease })),
    probeVoiceOver: vi.fn(async () => options.probe ?? 'stopped'),
    guidepupVolume: vi.fn(async () => {
      volumeReads += 1
      return volumeReads === 2 ? '/dev/diskFixture' : undefined
    }),
    createSnapshot: vi.fn(async () => snapshot),
    startWorker: vi.fn<SessionRuntime['startWorker']>(
      (_snapshot, _url, onStarted) => {
        if (outcome.started) {
          onStarted()
        }
        return worker
      },
    ),
    stopVoiceOver: vi.fn(async () => {}),
    verifyVoiceOverStopped: vi.fn(async () => options.stopped ?? true),
    detachGuidepupVolume: vi.fn(async () => true),
    restore: vi.fn(async () => {}),
    saveEvidence: vi.fn(async () => '/tmp/evidence.json'),
    removeSnapshot: vi.fn(async () => {}),
    onSignal: vi.fn<SessionRuntime['onSignal']>(() => () => {}),
    delay: vi.fn<SessionRuntime['delay']>(async () => {}),
  } satisfies SessionRuntime
  return { ...runtime, lockRelease, worker }
}
