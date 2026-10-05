import { JSDOM } from 'jsdom'
import { expect, test, vi } from 'vitest'
import factory from '../../../dist/nwsapi.js'
import { bindResolver } from '../../../src/core/compile/factory.mts'
import { createCache } from '../../../src/core/cache/plan.mts'
import type { EngineState } from '../../../src/core/state/types.mts'

test('identical code factories bind independent resolver state', () => {
  const engine = {
    primordials: { MapCtor: Map },
    Snapshot: { marker: 3 },
    codeFactories: null,
  } as unknown as EngineState
  engine.createCache = limit => createCache(engine, limit)
  const source = 'return function Resolver(){return s.marker + a.seen}'
  const first = bindResolver(engine, source, { seen: 4, kept: 0, rest: 0 })
  engine.Snapshot = { marker: 8 } as unknown as EngineState['Snapshot']
  const second = bindResolver(engine, source, { seen: 9, kept: 0, rest: 0 })
  expect(engine.codeFactories!.factories.size()).toBe(1)
  expect(first).not.toBe(second)
  expect(Reflect.apply(first, null, [])).toBe(7)
  expect(Reflect.apply(second, null, [])).toBe(17)
})

test('code factory retention is bounded during distinct source churn', () => {
  const engine = {
    primordials: { MapCtor: Map },
    codeFactories: null,
  } as unknown as EngineState
  engine.createCache = limit => createCache(engine, limit)
  for (let index = 0; index < 1024; ++index) {
    const source =
      `return function Resolver(){return ${index}}` + ' '.repeat(1024)
    const resolver = bindResolver(engine, source, undefined)
    expect(Reflect.apply(resolver, null, [])).toBe(index)
    expect(engine.codeFactories!.factories.size()).toBeLessThanOrEqual(64)
    expect(engine.codeFactories!.units).toBeLessThanOrEqual(32_768)
  }
  const size = engine.codeFactories!.factories.size()
  const large = bindResolver(
    engine,
    'return function Resolver(){return 1}' + ' '.repeat(65_536),
    undefined,
  )
  expect(Reflect.apply(large, null, [])).toBe(1)
  expect(engine.codeFactories!.factories.size()).toBe(size)
})

test('document changes enable code reuse after the first switch', t => {
  const first = new JSDOM('<!doctype html><i class="hit"></i>')
  const second = new JSDOM('<!doctype html><i></i>')
  t.onTestFinished(() => {
    first.window.close()
    second.window.close()
  })
  const engine = factory(first.window)
  const nodes = [first, second].map(dom =>
    dom.window.document.querySelector('i')!,
  )
  const calls = vi.spyOn(globalThis, 'Function')
  t.onTestFinished(() => calls.mockRestore())
  for (let index = 0; index < 10; ++index) {
    expect(engine.match('i:not(.hit)', nodes[index % 2]!)).toBe(index % 2 === 1)
  }
  expect(calls).toHaveBeenCalledTimes(2)
  engine.configure({}, true)
  expect(engine.match('i:not(.hit)', nodes[0]!)).toBe(false)
  expect(calls).toHaveBeenCalledTimes(2)
})

test('single-document compilation does not retain an extra code cache', () => {
  const engine = { Snapshot: {} } as unknown as EngineState
  bindResolver(engine, 'return function Resolver(){return true}', undefined)
  expect(engine.codeFactories).toBeUndefined()
})
