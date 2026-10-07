import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import type { Page } from '@playwright/test'
import { afterEach, test, vi } from 'vitest'
import { nativeTiming } from '../../../../../scripts/repo/bench/native/timing.mts'
import type {
  NativeContext,
  NativeGlobals,
} from '../../../../../scripts/repo/bench/native/host.mts'

afterEach(() => vi.unstubAllGlobals())

async function measure(
  first: boolean,
  failure: 'none' | 'cold' | 'initial' | 'warm' | 'throw',
) {
  const dom = new JSDOM('<body></body>')
  const documents: JSDOM[] = []
  let ticks = 0
  let removed = 0
  vi.stubGlobal('performance', {
    now: () => {
      ticks += 10
      return ticks
    },
  })
  const host = {
    __createContext(
      html: string,
      engine: number,
      initialize = true,
    ): NativeContext {
      const frame = new JSDOM(html)
      documents.push(frame)
      let calls = 0
      const all = (selector: string) => {
        calls += 1
        if (engine === 1 && initialize) {
          if (failure === 'throw') {
            throw new Error('unsupported')
          }
          if (failure === 'initial' || (failure === 'warm' && calls > 1)) {
            return []
          }
        }
        return frame.window.document.querySelectorAll(selector)
      }
      return {
        frame: {
          remove: () => {
            removed += 1
          },
        } as unknown as HTMLIFrameElement,
        document: frame.window.document,
        all,
        first: selector =>
          engine === 1 && failure === 'cold'
            ? null
            : (all(selector)[0] ?? null),
      }
    },
  } as NativeGlobals
  vi.stubGlobal('window', host)
  const page = {
    evaluate: async <Input, Output>(
      callback: (input: Input) => Output,
      options: Input,
    ) => callback(options),
  } as unknown as Page
  try {
    const result = await nativeTiming(page, {
      html: '<body><i class="a"></i></body>',
      selectors: [
        { category: 'class', selector: '.a' },
        { category: 'empty', selector: '.missing' },
      ],
      rounds: 2,
      iterations: 2,
      minRoundMs: 20,
      first,
      coldCount: 2,
    })
    assert.equal(result.rows.length, 2)
    assert.ok(removed > 1)
    assert.equal(removed, documents.length)
    return result
  } finally {
    for (let index = 0, length = documents.length; index < length; index += 1) {
      documents[index]!.window.close()
    }
    dom.window.close()
  }
}

test('native timing measures both exact-result engines with alternating rounds', async () => {
  const warm = await measure(false, 'none')
  assert.deepEqual(warm.rows[0]!.errors, [null, null])
  assert.deepEqual(warm.rows[0]!.sampleIterations, [
    [4, 4],
    [4, 4],
  ])
  assert.equal(warm.rows[0]!.samples[0]!.length, 2)
  assert.ok(warm.consumed > 0)
  assert.deepEqual(warm.rows[0]!.cold, [null, null])
  const cold = await measure(true, 'none')
  assert.deepEqual(cold.rows[0]!.cold, [5, 5])
  assert.deepEqual(cold.rows[1]!.errors, [null, null])
})

test('native timing invalidates timings after correctness failures and skips failed engines', async () => {
  const failures = ['initial', 'warm', 'throw'] as const
  for (let index = 0, length = failures.length; index < length; index += 1) {
    const result = await measure(false, failures[index]!)
    assert.ok(result.rows[0]!.errors[1])
    assert.deepEqual(result.rows[0]!.samples[1], [])
    assert.equal(result.rows[0]!.milliseconds[1], null)
    assert.equal(result.rows[0]!.samples[0]!.length, 2)
  }
  const cold = await measure(true, 'cold')
  assert.ok(cold.rows[0]!.errors[1])
  assert.deepEqual(cold.rows[0]!.coldSamples[1], [])
})
