import { expect, test, vi } from 'vitest'
import DOMSelector from '../../../src/dom-selector.js'

function fixture() {
  const node = { nodeType: 1 }
  const document = { nodeType: 9, createElement: () => node }
  const window = { document, TypeError }
  const config = { VERBOSITY: true, LEGACY: false }
  const engine = {
    Snapshot: { doc: document },
    configure: vi.fn(options => {
      if (options === undefined) {
        return config
      }
      Object.assign(config, options)
      return true
    }),
    closest: vi.fn(() => node),
    first: vi.fn(() => node),
    match: vi.fn(() => true),
    select: vi.fn(() => [node]),
  }
  return { config, document, engine, node, window }
}

test('pending configuration is copied and applied to an injected engine', () => {
  const { config, engine, window } = fixture()
  const options = { LEGACY: true }
  DOMSelector.configure(window, options)
  options.LEGACY = false
  DOMSelector.use(window, engine)
  expect(config.LEGACY).toBe(true)
  expect(engine.configure).toHaveBeenLastCalledWith(
    { LEGACY: true, VERBOSITY: true },
    true,
  )
  expect(new DOMSelector(window).engine).toBe(engine)
})

test('query error policy never toggles shared configuration', () => {
  const { config, engine, node, window } = fixture()
  DOMSelector.use(window, engine)
  const adapter = new DOMSelector(window)
  adapter.matches('div', node)
  engine.configure.mockClear()
  const error = new SyntaxError('invalid selector')
  engine.match.mockImplementation(() => {
    throw error
  })
  expect(() => adapter.matches('[', node)).toThrow(error)
  expect(adapter.matches('[', node, { noexcept: true })).toBe(false)
  expect(config.VERBOSITY).toBe(true)
  expect(engine.configure).not.toHaveBeenCalled()
})

test('each DOM query uses the bound engine and wraps its input once', () => {
  const { document, engine, node, window } = fixture()
  DOMSelector.use(window, engine)
  const wrapperForImpl = vi.fn(
    value => (value === 'document' ? document : node) as Node,
  )
  const adapter = new DOMSelector(window, 'document', {
    idlUtils: { wrapperForImpl },
  })
  wrapperForImpl.mockClear()
  expect(adapter.matches('div', 'node')).toBe(true)
  expect(adapter.closest('div', 'node')).toBe(node)
  expect(adapter.querySelector('div', 'document')).toBe(node)
  expect(adapter.querySelectorAll('div', 'document')).toEqual([node])
  expect(wrapperForImpl).toHaveBeenCalledTimes(4)
  expect(engine.first).toHaveBeenCalledWith('div', document)
  expect(engine.select).toHaveBeenCalledWith('div', document)
  expect(engine.match).toHaveBeenCalledWith('div', node)
  expect(engine.closest).toHaveBeenCalledWith('div', node)
})

test('clearing caches preserves engine identity and setup locks', () => {
  const { engine, node, window } = fixture()
  DOMSelector.use(window, engine)
  const adapter = new DOMSelector(window)
  adapter.matches('div', node)
  adapter.selectors = new Map([['div', { ast: undefined, branches: [] }]])
  engine.configure.mockClear()
  adapter.clear()
  expect(engine.configure).not.toHaveBeenCalled()
  adapter.clear(true)
  expect(engine.configure).toHaveBeenCalledWith({}, true)
  expect(adapter.selectors.size).toBe(0)
  expect(adapter.engine).toBe(engine)
  expect(() => DOMSelector.configure(window, {})).toThrow(
    'before its first use',
  )
})
