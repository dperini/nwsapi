import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import { createCache } from '../../../src/core/cache/plan.mts'
import {
  parseChain,
  parseSiblingChain,
} from '../../../src/core/select/chain.mts'
import type { EngineState } from '../../../src/core/state/types.mts'
import factory from '../../../dist/nwsapi.js'
import { registerLegacyInContext } from '../common/legacy.mts'

const filename = fileURLToPath(
  new URL('../../../dist/nwsapi.js', import.meta.url),
)
const source = readFileSync(filename, 'utf8')

function parserEngine(limit: number) {
  const engine = {
    CACHE_LIMIT: limit,
    primordials: { MapCtor: Map },
    chainPlans: undefined,
    reChainPart: /^([A-Za-z][-\w]*)?(?:\.([-\w]+))?$/,
  } as unknown as EngineState
  engine.chainPlans = createCache(engine, limit)
  return engine
}

test('parsed chain descriptions are reused and bounded at 256 entries', () => {
  const engine = parserEngine(256)
  const descendant = parseChain(engine, 'main .item')!
  const sibling = parseSiblingChain(engine, 'main~.item')!

  expect(descendant).toEqual([
    { tag: 'main', cls: undefined },
    { tag: undefined, cls: 'item' },
  ])
  expect(parseChain(engine, 'main .item')).toBe(descendant)
  expect(parseSiblingChain(engine, 'main~.item')).toBe(sibling)
  expect(engine.chainPlans.size()).toBe(2)

  for (let index = 0; index < 300; index++) {
    parseChain(engine, `main .item${index}`)
  }

  expect(engine.chainPlans.size()).toBeLessThanOrEqual(256)
  expect(parseChain(engine, 'main .item')).not.toBe(descendant)
  const current = parseChain(engine, 'main .item299')
  expect(parseChain(engine, 'main .item299')).toBe(current)
})

test('cached descriptions keep selections current after mutations and switches', t => {
  const first = new JSDOM(
    '<!doctype html><main><i class="before"></i><b class="target"></b></main>',
  )
  const second = new JSDOM(
    '<!doctype html><main><i class="before"></i><b class="target"></b></main>',
  )
  t.onTestFinished(() => {
    first.window.close()
    second.window.close()
  })
  const engine = factory(first.window)
  const selector = 'i.before ~ b.target'

  expect(engine.select(selector, first.window.document)).toHaveLength(1)
  first.window.document.querySelector('i')!.className = 'changed'
  expect(engine.select(selector, first.window.document)).toHaveLength(0)

  expect(engine.select(selector, second.window.document)).toHaveLength(1)
  second.window.document.querySelector('i')!.className = 'changed'
  expect(engine.select(selector, second.window.document)).toHaveLength(0)
  expect(engine.select(selector, first.window.document)).toHaveLength(0)
})

test('chain parsing initializes with the legacy cache when Map is unavailable', t => {
  const { window } = new JSDOM(
    '<!doctype html><main><i class="before"></i><b class="target"></b></main>',
  )
  t.onTestFinished(() => window.close())
  const module = { exports: {} as typeof factory }
  const context = vm.createContext({
    module,
    exports: module.exports,
    Map: undefined,
  })
  vm.runInContext(source, context, { filename })
  const engine = registerLegacyInContext(module.exports(window), context)
  engine.configure({ LEGACY: false })

  const selector = 'i.before ~ b.target'
  expect(engine.select(selector, window.document)).toHaveLength(1)
  window.document.querySelector('i')!.className = 'changed'
  expect(engine.select(selector, window.document)).toHaveLength(0)
})
