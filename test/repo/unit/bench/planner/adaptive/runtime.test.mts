import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { test, vi } from 'vitest'
import type {
  BulkHasPlan,
  EngineState,
} from '../../../../../../src/core/state/types.mts'
import {
  adaptiveHas,
  forwardTo,
  inverseSuffix,
} from '../../../../../../scripts/repo/bench/planner/adaptive/runtime.mts'

function plan(filtered: boolean): BulkHasPlan {
  return {
    anchor: {
      factory: filtered
        ? [(element: Element) => element.hasAttribute('data-keep')]
        : [],
      nodeset: ['.card'],
    },
    witness: {
      factory: filtered
        ? [(element: Element) => element.hasAttribute('data-hit')]
        : [],
      nodeset: ['.hit'],
    },
    denseInverse: true,
  } as unknown as BulkHasPlan
}
function engine(weak = true): EngineState {
  return {
    hasCandidates: (selector: string, context: Document | Element) =>
      Array.from(context.querySelectorAll(selector)),
    createWeakMap: () => (weak ? new WeakMap() : null),
    upOf: (element: Element) => element.parentNode,
  } as unknown as EngineState
}

test('adaptive route choices preserve filtered identities and order, including unavailable inverse marks', () => {
  const html = Array.from(
    { length: 32 },
    (_, index) =>
      `<section class="card" ${index % 2 ? '' : 'data-keep'}><i class="hit" ${index % 3 ? '' : 'data-hit'}></i><i class="hit"></i></section>`,
  ).join('')
  const dom = new JSDOM(html)
  try {
    const document = dom.window.document
    const anchors = Array.from(document.querySelectorAll('.card'))
    const prefixes = [0, 4, 32, 40]
    for (let filtered = 0; filtered < 2; filtered += 1) {
      const expected = Array.from(
        document.querySelectorAll(
          filtered ? '.card[data-keep]:has(.hit[data-hit])' : '.card:has(.hit)',
        ),
      )
      for (
        let prefix = 0, length = prefixes.length;
        prefix < length;
        prefix += 1
      ) {
        assert.deepEqual(
          adaptiveHas(
            engine(),
            plan(Boolean(filtered)),
            document,
            anchors,
            prefixes[prefix]!,
            () => false,
          ),
          expected,
        )
        assert.deepEqual(
          adaptiveHas(
            engine(),
            plan(Boolean(filtered)),
            document,
            anchors,
            prefixes[prefix]!,
            () => true,
          ),
          expected,
        )
        assert.deepEqual(
          adaptiveHas(
            engine(false),
            plan(Boolean(filtered)),
            document,
            anchors,
            prefixes[prefix]!,
            () => true,
          ),
          expected,
        )
      }
    }
    const choose = vi.fn(() => false)
    adaptiveHas(engine(), plan(true), document, anchors, 4, choose)
    assert.deepEqual(choose.mock.calls[0], [32, 4, 2, 1, 4, true])
    assert.equal(
      adaptiveHas(
        engine(),
        plan(false),
        document,
        anchors.slice(0, 3),
        1,
        () => true,
      ),
      null,
    )
    assert.equal(
      adaptiveHas(engine(), plan(false), document.body, anchors, 1, () => true),
      null,
    )
    const progress = {
      next: 0,
      passed: 0,
      hits: 0,
      candidates: 0,
      results: [] as Element[],
    }
    forwardTo(engine(), plan(true), document, anchors, progress, anchors.length)
    assert.equal(progress.passed, 16)
    assert.equal(progress.hits, 6)
    assert.equal(progress.candidates, 32)
    const fallback = {
      next: 0,
      passed: 0,
      hits: 0,
      candidates: 0,
      results: [] as Element[],
    }
    assert.equal(
      inverseSuffix(engine(false), plan(false), document, anchors, fallback),
      false,
    )
    assert.equal(fallback.next, 0)
    const witnesses = Array.from(document.querySelectorAll('.hit'))
    for (let index = 0, length = witnesses.length; index < length; index += 1) {
      witnesses[index]!.remove()
    }
    assert.deepEqual(
      adaptiveHas(engine(), plan(false), document, anchors, 0, () => true),
      [],
    )
  } finally {
    dom.window.close()
  }
})
