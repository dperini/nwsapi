import type { NwsapiEngine } from '../../../../../.config/runtime.d.ts'

export type LifecycleMode = 'warm' | 'attribute' | 'class' | 'child' | 'cold'
export interface LifecycleWorld {
  doc: Document
  create: () => NwsapiEngine
}
export interface LifecycleTiming {
  rounds: number
  milliseconds: number
  batch: number
  coldCalls: number
  warmups: number
}
export interface LifecycleState extends LifecycleWorld {
  engine: NwsapiEngine
  marker: Element
  originalClass: string
  child: Element
  toggle: boolean
}

export function createLifecycleState(world: LifecycleWorld): LifecycleState {
  const marker = world.doc.body.firstElementChild
  if (!marker) {
    throw new Error('Lifecycle fixture needs a body element to mutate.')
  }
  const child = world.doc.createElement('i')
  child.className = 'card'
  child.setAttribute('data-testid', 'benchmark')
  return {
    ...world,
    engine: world.create(),
    marker,
    originalClass: marker.className,
    child,
    toggle: false,
  }
}

export function runLifecycleQuery(
  state: LifecycleState,
  selector: string,
  mode: LifecycleMode,
) {
  state.toggle = !state.toggle
  if (mode === 'class') {
    state.marker.className = state.toggle
      ? state.originalClass + ' bench-toggle'
      : state.originalClass
  } else if (mode === 'attribute') {
    state.marker.setAttribute('data-bench', String(state.toggle))
  } else if (mode === 'child') {
    if (state.toggle) {
      state.doc.body.append(state.child)
    } else {
      state.child.remove()
    }
  }
  return state.engine.select(selector, state.doc)
}

export function checkLifecycleState(
  state: LifecycleState,
  selector: string,
  mode: LifecycleMode,
) {
  const actual = Array.from(runLifecycleQuery(state, selector, mode))
  const expected = state.doc.querySelectorAll(selector)
  checkLifecycleResult(actual, expected, selector, mode)
}

export function checkLifecycleResult(
  actual: ArrayLike<Element>,
  expected: ArrayLike<Element>,
  selector: string,
  mode: LifecycleMode,
) {
  if (
    actual.length !== expected.length ||
    Array.from(actual).some((node, index) => node !== expected[index])
  ) {
    throw new Error(`Ordered identity mismatch: ${selector} / ${mode}`)
  }
}

export function measureLifecycle(
  worlds: LifecycleWorld[],
  selector: string,
  mode: LifecycleMode,
  timing: LifecycleTiming,
  now = () => performance.now(),
) {
  const states = worlds.map(createLifecycleState)
  const samples: number[][] = worlds.map(() => [])
  const calls: number[][] = worlds.map(() => [])
  let consumed = 0
  for (const state of states) {
    checkLifecycleState(state, selector, mode)
    if (mode !== 'cold') {
      for (let index = 0; index < timing.warmups; ++index) {
        consumed += runLifecycleQuery(state, selector, mode).length
      }
    }
  }
  for (let round = 0; round < timing.rounds; ++round) {
    for (let turn = 0; turn < states.length; ++turn) {
      const index = (turn + round) % states.length
      const state = states[index]!
      const result = measureLifecycleRound(state, selector, mode, timing, now)
      samples[index]!.push(result.nanoseconds)
      calls[index]!.push(result.calls)
      consumed += result.consumed
      checkLifecycleState(state, selector, mode)
    }
  }
  return { samples, calls, consumed }
}

export function measureLifecycleRound(
  state: LifecycleState,
  selector: string,
  mode: LifecycleMode,
  timing: LifecycleTiming,
  now: () => number,
) {
  let consumed = 0
  let count = 0
  let elapsed = 0
  if (mode === 'cold') {
    const expected = state.doc.querySelectorAll(selector)
    for (; count < timing.coldCalls; ++count) {
      const engine = state.create()
      const start = now()
      const actual = engine.select(selector, state.doc)
      elapsed += now() - start
      consumed += actual.length
      checkLifecycleResult(actual, expected, selector, mode)
    }
  } else {
    const start = now()
    do {
      for (let index = 0; index < timing.batch; ++index) {
        consumed += runLifecycleQuery(state, selector, mode).length
      }
      count += timing.batch
      elapsed = now() - start
    } while (elapsed < timing.milliseconds)
  }
  return { nanoseconds: (elapsed * 1e6) / count, calls: count, consumed }
}

export function lifecycleBrowserSource() {
  return [
    createLifecycleState,
    runLifecycleQuery,
    checkLifecycleState,
    checkLifecycleResult,
    measureLifecycleRound,
    measureLifecycle,
  ]
    .map(method => `globalThis.${method.name} = ${method.toString()}`)
    .join('\n')
}
