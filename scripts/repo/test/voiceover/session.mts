import type { PreferenceSnapshot } from './snapshot.mts'

export type VoiceOverProbe = 'running' | 'stopped' | 'unknown'

export interface WorkerOutcome {
  status: number | null
  signal: string | null
  started: boolean
  evidence?: NarrationEvidence
  error?: string
}

export interface NarrationEvidence {
  action: string
  pageUrl: string
  phrases: string[]
}

export interface WorkerHandle {
  wait(): Promise<WorkerOutcome>
  terminate(): void
  kill(): void
  killOwnedBrowser(): void
}

export interface SessionRuntime {
  acquireLock(): Promise<{ release(): Promise<void> }>
  probeVoiceOver(): Promise<VoiceOverProbe>
  guidepupVolume(): Promise<string | undefined>
  createSnapshot(): Promise<PreferenceSnapshot>
  startWorker(
    snapshot: PreferenceSnapshot,
    url: string,
    onStarted: () => void,
    onBrowserStarted: (pid: number) => void,
    authorizeStart: () => Promise<boolean>,
  ): WorkerHandle
  stopVoiceOver(): Promise<void>
  verifyVoiceOverStopped(): Promise<boolean>
  detachGuidepupVolume(): Promise<boolean>
  restore(snapshot: PreferenceSnapshot): Promise<void>
  saveEvidence(
    snapshot: PreferenceSnapshot,
    evidence: NarrationEvidence,
  ): Promise<string>
  removeSnapshot(snapshot: PreferenceSnapshot): Promise<void>
  onSignal(handler: (signal: string) => void): () => void
  delay(milliseconds: number): Promise<void>
}

export interface SessionOptions {
  url: string
  timeoutMs?: number
  stopGraceMs?: number
  progress?: (message: string) => void
  runtime: SessionRuntime
}

export interface SessionResult {
  status: 'captured' | 'failed' | 'incomplete'
  message: string
  evidencePath?: string
  recoveryPath?: string
  exitCode: number
}

interface SessionState {
  options: SessionOptions
  runtime: SessionRuntime
  lock: Awaited<ReturnType<SessionRuntime['acquireLock']>> | undefined
  snapshot: PreferenceSnapshot | undefined
  worker: WorkerHandle | undefined
  started: boolean
  cancellation?: string
  restored: boolean
  deadlineTimer?: ReturnType<typeof setTimeout>
  removeSignalHandlers: () => void
  signal: Promise<WorkerOutcome>
  resolveSignal: (outcome: WorkerOutcome) => void
}

export async function runNarrationSession(
  options: SessionOptions,
): Promise<SessionResult> {
  const state = createSessionState(options)
  try {
    await prepareSession(state)
    const outcome = await awaitWorker(state)
    return await finishWorker(state, outcome)
  } catch (error) {
    return await handleSessionError(state, error)
  } finally {
    finishSessionState(state)
  }
}

function createSessionState(options: SessionOptions): SessionState {
  let resolveSignal!: (outcome: WorkerOutcome) => void
  const signal = new Promise<WorkerOutcome>(resolve => {
    resolveSignal = resolve
  })
  return {
    options,
    runtime: options.runtime,
    lock: undefined,
    snapshot: undefined,
    worker: undefined,
    started: false,
    restored: false,
    removeSignalHandlers: () => {},
    signal,
    resolveSignal,
  }
}

async function prepareSession(state: SessionState) {
  state.removeSignalHandlers = state.runtime.onSignal(value => {
    state.cancellation = value
    state.resolveSignal({ status: null, signal: value, started: state.started })
  })
  state.lock = await state.runtime.acquireLock()
  assertNotCancelled(state)
  await requireSafePreflight(state.runtime)
  state.options.progress?.(
    'Saving a private recovery snapshot of five VoiceOver preference entries.',
  )
  state.snapshot = await state.runtime.createSnapshot()
  assertNotCancelled(state)
  state.options.progress?.(
    'Opening the fixed local API reader in an isolated browser session.',
  )
  startDeadline(state)
  assertNotCancelled(state)
  state.worker = state.runtime.startWorker(
    state.snapshot,
    state.options.url,
    () => {
      state.started = true
    },
    () => {},
    async () => !state.cancellation,
  )
}

function startDeadline(state: SessionState) {
  state.deadlineTimer = setTimeout(() => {
    state.cancellation = 'time limit reached'
    state.resolveSignal({
      status: null,
      signal: null,
      started: state.started,
      error: state.cancellation,
    })
  }, state.options.timeoutMs ?? 120_000)
}

async function awaitWorker(state: SessionState) {
  const worker = state.worker
  if (!worker) {
    throw new Error('The narration worker was not created.')
  }
  return Promise.race([worker.wait(), state.signal])
}

async function finishWorker(
  state: SessionState,
  outcome: WorkerOutcome,
): Promise<SessionResult> {
  const worker = state.worker
  const snapshot = state.snapshot
  if (!worker || !snapshot) {
    return incomplete('The narration session state is incomplete.', snapshot)
  }
  if (state.cancellation) {
    if (
      !(await stopWorker(
        worker,
        state.runtime,
        state.options.stopGraceMs ?? 3000,
      ))
    ) {
      return incomplete(
        'The worker did not stop; preferences were preserved.',
        snapshot,
      )
    }
  } else if (!(await closeWorker(worker))) {
    return incomplete('Owned processes could not be stopped safely.', snapshot)
  }
  const cleanup = await cleanSession(
    state.runtime,
    snapshot,
    state.started || outcome.started,
  )
  if (!cleanup.complete) {
    return incomplete(cleanup.message, snapshot)
  }
  state.restored = true
  if (state.cancellation) {
    await releaseCompletedSnapshot(state)
    return { status: 'failed', exitCode: 1, message: state.cancellation }
  }
  if (
    outcome.status !== 0 ||
    !validEvidence(outcome.evidence, state.options.url)
  ) {
    await releaseCompletedSnapshot(state)
    return {
      status: 'failed',
      exitCode: 1,
      message: outcome.error ?? 'No verified VoiceOver speech was captured.',
    }
  }
  const evidencePath = await state.runtime.saveEvidence(
    snapshot,
    outcome.evidence!,
  )
  await releaseCompletedSnapshot(state)
  return {
    status: 'captured',
    exitCode: 0,
    message: `Captured the expected API page narration. Evidence: ${evidencePath}`,
    evidencePath,
  }
}

async function handleSessionError(
  state: SessionState,
  error: unknown,
): Promise<SessionResult> {
  if (
    state.worker &&
    !(await stopWorker(
      state.worker,
      state.runtime,
      state.options.stopGraceMs ?? 3000,
    ))
  ) {
    return incomplete(
      'The worker may still be active; preferences were preserved.',
      state.snapshot,
    )
  }
  if (state.snapshot) {
    if (!state.restored) {
      const cleanup = await cleanSession(
        state.runtime,
        state.snapshot,
        state.started,
      ).catch(() => ({
        complete: false,
        message: 'Session cleanup could not be confirmed.',
      }))
      if (!cleanup.complete) {
        return incomplete(cleanup.message, state.snapshot)
      }
      state.restored = true
    }
    try {
      await releaseCompletedSnapshot(state)
    } catch {
      return incomplete(
        'Preference restoration completed, but recovery cleanup failed.',
        state.snapshot,
      )
    }
  }
  return { status: 'failed', exitCode: 1, message: errorText(error) }
}

async function releaseCompletedSnapshot(state: SessionState) {
  const snapshot = state.snapshot
  if (!snapshot) {
    return
  }
  await state.lock?.release()
  state.lock = undefined
  await state.runtime.removeSnapshot(snapshot)
  state.snapshot = undefined
}

function finishSessionState(state: SessionState) {
  if (state.deadlineTimer) {
    clearTimeout(state.deadlineTimer)
  }
  state.removeSignalHandlers()
  if (state.lock && !state.snapshot) {
    void state.lock.release().catch(() => undefined)
  }
}

async function requireSafePreflight(runtime: SessionRuntime) {
  const state = await runtime.probeVoiceOver()
  if (state !== 'stopped') {
    throw new Error(
      `VoiceOver state is ${state}; the session requires a confirmed stopped state.`,
    )
  }
  if (await runtime.guidepupVolume()) {
    throw new Error('A Guidepup preferences volume already exists.')
  }
}

async function stopWorker(
  worker: WorkerHandle,
  runtime: SessionRuntime,
  grace: number,
) {
  try {
    worker.terminate()
    const stopTimer = setTimeout(() => worker.kill(), grace)
    const stopped = await Promise.race([
      worker.wait().then(
        () => true,
        () => true,
      ),
      runtime.delay(grace + 1000).then(() => false),
    ])
    clearTimeout(stopTimer)
    if (!stopped) {
      worker.kill()
      const exited = await Promise.race([
        worker.wait().then(
          () => true,
          () => true,
        ),
        runtime.delay(grace).then(() => false),
      ])
      if (!exited) {
        return false
      }
    }
    return closeWorker(worker)
  } catch {
    return false
  }
}

async function closeWorker(worker: WorkerHandle) {
  try {
    worker.kill()
    worker.killOwnedBrowser()
    return true
  } catch {
    return false
  }
}

async function cleanSession(
  runtime: SessionRuntime,
  snapshot: PreferenceSnapshot,
  started: boolean,
) {
  if (started) {
    try {
      await runtime.stopVoiceOver()
    } catch {
      return { complete: false, message: 'Could not stop VoiceOver safely.' }
    }
  }
  let stopped: boolean
  try {
    stopped = await runtime.verifyVoiceOverStopped()
  } catch {
    return { complete: false, message: 'VoiceOver state is uncertain.' }
  }
  if (!stopped) {
    return { complete: false, message: 'VoiceOver is not confirmed stopped.' }
  }
  let mounted: string | undefined
  try {
    mounted = await runtime.guidepupVolume()
  } catch {
    return { complete: false, message: 'Mounted volume identity is uncertain.' }
  }
  if (mounted && !started) {
    return { complete: false, message: 'An unowned Guidepup volume appeared.' }
  }
  if (mounted) {
    try {
      if (!(await runtime.detachGuidepupVolume())) {
        return {
          complete: false,
          message: 'Could not detach the session volume.',
        }
      }
    } catch {
      return {
        complete: false,
        message: 'Could not detach the session volume.',
      }
    }
  }
  try {
    if (await runtime.guidepupVolume()) {
      return {
        complete: false,
        message: 'The Guidepup volume remains mounted.',
      }
    }
  } catch {
    return { complete: false, message: 'Mounted volume state is uncertain.' }
  }
  if (!started) {
    return { complete: true, message: '' }
  }
  try {
    await runtime.restore(snapshot)
  } catch {
    return {
      complete: false,
      message: 'Preference restoration needs recovery.',
    }
  }
  return { complete: true, message: '' }
}

function validEvidence(
  evidence: NarrationEvidence | undefined,
  expectedUrl: string,
) {
  return Boolean(
    evidence &&
    evidence.pageUrl === expectedUrl &&
    evidence.action &&
    evidence.phrases.some(phrase => phrase.trim().length > 0),
  )
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function assertNotCancelled(state: SessionState) {
  if (state.cancellation) {
    throw new Error(state.cancellation)
  }
}

function incomplete(message: string, snapshot: PreferenceSnapshot | undefined) {
  return {
    status: 'incomplete' as const,
    exitCode: 1,
    message: `${message} Recovery data is preserved${snapshot ? ` at ${snapshot.root}` : ''}.`,
    ...(snapshot ? { recoveryPath: snapshot.root } : {}),
  }
}
