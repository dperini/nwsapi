import { JSDOM } from 'jsdom'
import { expect, onTestFinished, test, vi } from 'vitest'
import factory from '../../../../dist/nwsapi.js'
import DOMSelector from '../../../../dist/adapter/dom-selector.js'

function fixture() {
  const { window } = new JSDOM(
    '<!doctype html><main>' +
      '<section class="card" data-ok="1"><i class="hit" data-ok="1"></i><i class="hit" data-ok="1"></i><i class="hit" data-ok="1"></i></section>'.repeat(
        32,
      ) +
      '</main>',
  )
  onTestFinished(() => window.close())
  return { window, engine: factory(window), document: window.document }
}

test('new engines enable the route planner without configuration', () => {
  const { engine } = fixture()
  expect(engine.Config.ROUTE_PLANNER).toBe(true)
  expect(engine.configure('ROUTE_PLANNER')).toBe(true)
})

test('opt-out and re-enable invalidate prepared routes while keeping exact results', () => {
  const { engine, document } = fixture()
  const planner = vi.fn(() => true)
  engine.registerBulkHasPlanner(planner)
  const selector = '.card[data-ok="1"]:has(.hit[data-ok="1"])'
  const expected = Array.from(document.querySelectorAll(selector))
  // The first query compiles the plan. Repeated queries can use bulk routing.
  engine.select(selector, document)
  expect(engine.select(selector, document)).toEqual(expected)
  expect(planner).toHaveBeenCalled()
  engine.match('.card', expected[0]!)
  expect(engine.matchResolvers.size()).toBeGreaterThan(0)
  engine.configure({ ROUTE_PLANNER: false })
  expect(engine.matchResolvers.size()).toBe(0)
  planner.mockClear()
  engine.select(selector, document)
  expect(engine.select(selector, document)).toEqual(expected)
  expect(planner).not.toHaveBeenCalled()
  engine.configure({ ROUTE_PLANNER: true })
  engine.select(selector, document)
  expect(engine.select(selector, document)).toEqual(expected)
  expect(planner).toHaveBeenCalled()
})

test('policy selection, removal, and invalid hosts preserve consistent configuration', () => {
  const { engine } = fixture()
  engine.useRoutePlanner(null)
  expect(engine.Config.ROUTE_PLANNER).toBe(false)
  engine.useRoutePlanner('jsdom')
  expect(engine.Config.ROUTE_PLANNER).toBe(true)
  expect(() => engine.useRoutePlanner('invalid' as 'jsdom')).toThrow(TypeError)
  expect(engine.Config.ROUTE_PLANNER).toBe(true)
  engine.useRoutePlanner('chromium')
  expect(engine.Config.ROUTE_PLANNER).toBe(true)
})

test('jsdom adapter enables its policy by default and honors an explicit opt-out', () => {
  const first = fixture()
  expect(new DOMSelector(first.window).engine.Config.ROUTE_PLANNER).toBe(true)
  const second = fixture()
  DOMSelector.configure(second.window, { ROUTE_PLANNER: false })
  expect(new DOMSelector(second.window).engine.Config.ROUTE_PLANNER).toBe(false)
})

test('unsupported queries and planner failures retain exact matching', () => {
  const { engine, document } = fixture()
  const planner = vi.fn(() => {
    throw new Error('Planner unavailable')
  })
  engine.registerBulkHasPlanner(planner)
  const selector = '.card[data-ok="1"]:has(.hit[data-ok="1"])'
  engine.select(selector, document)
  expect(engine.select(selector, document)).toEqual(
    Array.from(document.querySelectorAll(selector)),
  )
  expect(planner).toHaveBeenCalled()
  planner.mockClear()
  expect(engine.select('section:has(i)', document)).toHaveLength(32)
  expect(planner).not.toHaveBeenCalled()
})
