import type * as Fs from 'node:fs'
import { beforeEach, vi } from 'vitest'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  memory: vi.fn(),
  sample: vi.fn(),
  post: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  profile: 'normal',
}))
export { state }
vi.mock('node:fs', async () => ({
  ...(await vi.importActual<typeof Fs>('node:fs')),
  writeFileSync: state.write,
  mkdtempSync: () => '/profile',
}))
vi.mock('../../../../scripts/repo/bench/documents.mts', () => ({
  components: () =>
    '<main id="root"><section class="card"><button class="primary" data-testid="btn-150"></button><input class="input"></section></main>',
}))
vi.mock('../../../../scripts/repo/bench/timing.mts', () => ({
  timingEngine: 'fixture',
  sample: state.sample,
}))
vi.mock('../../../../scripts/repo/bench/ancestor/memory.mts', () => ({
  profileAncestorMemory: state.memory,
}))
vi.mock('node:inspector/promises', () => ({
  Session: class {
    connect = state.connect
    disconnect = state.disconnect
    post = state.post
  },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  state.profile = 'normal'
  state.memory.mockImplementation(
    async (query: (index: number) => unknown, names: string[]) => {
      names.forEach((_name, index) => query(index))
      return { variants: names }
    },
  )
  state.sample.mockImplementation(async (callback: () => void) => {
    callback()
    callback()
    return { milliseconds: 1 }
  })
  state.post.mockImplementation(async (command: string) =>
    command === 'Profiler.stop'
      ? {
          profile: {
            samples:
              state.profile === 'missing'
                ? undefined
                : state.profile === 'empty'
                  ? []
                  : [1, 1, 2],
            nodes: [
              { id: 1, callFrame: { functionName: 'select', url: 'engine' } },
              { id: 2, callFrame: { functionName: 'read', url: 'engine' } },
              { id: 3, callFrame: { functionName: 'unused', url: 'engine' } },
            ],
          },
        }
      : {},
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
export async function invoke(
  name: 'candidate-memory' | 'cold-first-profile' | 'compiler',
  args: string[],
) {
  const argv = process.argv
  process.argv = [argv[0]!, `/bench/${name}.mts`, ...args]
  try {
    if (name === 'candidate-memory') {
      await import('../../../../scripts/repo/bench/candidate-memory.mts')
    } else if (name === 'cold-first-profile') {
      await import('../../../../scripts/repo/bench/cold-first-profile.mts')
    } else {
      await import('../../../../scripts/repo/bench/compiler.mts')
    }
  } finally {
    process.argv = argv
  }
}
