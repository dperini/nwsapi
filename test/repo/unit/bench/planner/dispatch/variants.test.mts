import assert from 'node:assert/strict'
import vm from 'node:vm'
import { test, vi } from 'vitest'

vi.mock(
  '../../../../../../scripts/repo/bench/planner/has/instrument.mts',
  () => ({
    routeBundle: (
      source: string,
      _route: string,
      _instrument: boolean,
      decision: string,
    ) => `${source}\nfunction route(anchors,witnesses) { return ${decision}; }`,
  }),
)
import { dispatchBundle } from '../../../../../../scripts/repo/bench/planner/dispatch/variants.mts'

const source =
  'var anchor=null,parts=["","",""];var plan={anchor: anchor, denseInverse:false};'
const model =
  'export function dispatchOverride(a,w,attributes,dense,ratio){ seen += 1; return w > a * 3; }'

function context(instrument: boolean, forward: boolean, memoize: boolean) {
  const sandbox = {
    seen: 0,
    plannerTrace: {} as { cacheHits?: number; inferences?: number },
  }
  const realm = vm.createContext(sandbox)
  new vm.Script(
    dispatchBundle(source, model, instrument, forward, memoize),
  ).runInContext(realm)
  return {
    sandbox,
    query: (a: number, w: number) =>
      new vm.Script(`route(Array(${a}),Array(${w}))`).runInContext(
        realm,
      ) as boolean,
  }
}

test('dispatch variants preserve fallback short circuits and optionally cache equivalent input decisions', () => {
  const regular = context(false, false, false)
  assert.equal(regular.query(32, 64), false)
  assert.equal(regular.query(32, 100), false)
  assert.equal(regular.query(32, 80), true)
  assert.equal(regular.sandbox.seen, 3)
  const forward = context(false, true, false)
  assert.equal(forward.query(32, 64), false)
  assert.equal(forward.sandbox.seen, 0)
  assert.equal(forward.query(32, 80), true)
  for (let index = 0; index < 2; index += 1) {
    const cached = context(Boolean(index), true, true)
    assert.equal(cached.query(32, 80), true)
    assert.equal(cached.query(32, 80), true)
    assert.equal(cached.sandbox.seen, 1)
    assert.equal(cached.query(32, 100), false)
    assert.equal(cached.sandbox.seen, 2)
    assert.deepEqual(
      cached.sandbox.plannerTrace,
      index ? { inferences: 2, cacheHits: 1 } : {},
    )
  }
})

test('dispatch generation rejects unsafe caching and ambiguous plan preparation', () => {
  assert.throws(() => dispatchBundle(source, model, false, false, true))
  assert.throws(() => dispatchBundle('var plan={}', model))
  assert.throws(() => dispatchBundle(source + source, model))
})
