import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import type * as NodeFs from 'node:fs'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  close: vi.fn(),
  bundleClose: vi.fn(),
  version: '154.0',
  wrapped: false,
  interestError: false,
  invalidXml: false,
  metadataError: false,
  output: 'valid',
  fixture: {},
  aliases: [] as unknown[],
  route: vi.fn(),
}))
vi.mock('../../../../scripts/repo/browser.mts', () => ({
  CHROME_VERSION: '154.0',
  browserLaunchOptions: () => ({}),
}))
vi.mock('node:child_process', () => ({ execFileSync: () => 'fixture\n' }))
vi.mock('node:fs', async original => ({
  ...(await original<typeof NodeFs>()),
  existsSync: (file: string) =>
    !file.includes('/deep/') &&
    !file.includes('/nested/package.json') &&
    !file.includes('/mid/package.json'),
  readFileSync: (file: string) => {
    if (file.endsWith('compatibility.json')) {
      return JSON.stringify(state.fixture)
    }
    if (file.endsWith('/package.json')) {
      if (state.metadataError || file.includes('/inner/')) {
        return JSON.stringify({ name: 'inner' })
      }
      const name = file.split('/').at(-2)
      return JSON.stringify({
        name,
        version: 'fixture',
        exports: {
          '.': {
            import:
              name === 'lru-cache'
                ? { browser: { default: 'browser.js' } }
                : name === 'css-tree'
                  ? 'entry.js'
                  : undefined,
          },
        },
      })
    }
    return 'fixture-code'
  },
  writeFileSync: state.write,
}))
vi.mock('node:module', () => ({
  createRequire: () =>
    Object.assign(() => ({ version: 'fixture' }), {
      resolve: (name: string) =>
        `/fixture/${name}/mid/inner/nested/deep/entry.js`,
    }),
}))
vi.mock('rolldown', () => ({
  rolldown: async (options: {
    plugins: Array<{ resolveId: (id: string) => unknown }>
  }) => {
    state.aliases.push(
      options.plugins[0]!.resolveId('css-tree'),
      options.plugins[0]!.resolveId('unknown'),
    )
    return {
      close: state.bundleClose,
      generate: async () => ({
        output:
          state.output === 'empty'
            ? []
            : state.output === 'asset'
              ? [{ type: 'asset' }]
              : [
                  {
                    type: 'chunk',
                    imports: state.output === 'imports' ? ['other'] : [],
                    code: 'fixture-bundle',
                  },
                ],
      }),
    }
  },
}))
vi.mock('@playwright/test', () => ({
  chromium: {
    launch: async () => ({
      version: () => state.version,
      close: state.close,
      newPage: async () => ({
        route: async (
          _pattern: string,
          callback: (route: unknown) => unknown,
        ) => callback({ fulfill: state.route }),
        goto: async () => undefined,
        addScriptTag: async () => undefined,
        evaluate: async (callback: (arg: unknown) => unknown, arg?: unknown) =>
          callback(arg),
        locator: () => ({
          fill: async () => undefined,
          press: async () => undefined,
          hover: async () => undefined,
        }),
        waitForFunction: async (callback: () => unknown) => {
          callback()
          if (state.interestError) {
            throw Object.assign(new Error(), { name: 'TimeoutError' })
          }
        },
      }),
    }),
  },
}))
const argv = process.argv.slice()
let dom: JSDOM
class Adapter {
  querySelectorAll(selector: string, context: Document | Element) {
    return Array.from(context.querySelectorAll(selector))
  }
  matches(selector: string, element: Element) {
    return element.matches(selector)
  }
  supports() {
    return true
  }
  extractSubjects(selector: string) {
    return [{ selector }]
  }
  check(selector: string, element: Element) {
    return { match: element.matches(selector), pseudoElement: null }
  }
}
beforeEach(() => {
  vi.resetModules()
  state.write.mockClear()
  state.close.mockClear()
  state.bundleClose.mockClear()
  state.aliases = []
  state.version = '154.0'
  state.wrapped = false
  state.interestError = false
  state.invalidXml = false
  state.metadataError = false
  state.output = 'valid'
  state.fixture = {
    html: 'fixture',
    selectors: ['p', '[', '*'],
    shadowSelectors: ['slot'],
    xml: [
      {
        name: 'one',
        html: '<root><p id="xml"/><p/></root>',
        selectors: ['p', '['],
        attributes: [
          {
            id: 'xml',
            namespace: 'urn:test',
            name: 'a:value',
            value: 'fixture',
          },
        ],
      },
      { name: 'two', html: '<root/>', selectors: ['p'] },
    ],
  }
  dom = new JSDOM(
    '<section id="section"><p id="two" class="item"></p><p></p></section><div id="shadow-host"></div><dialog id="dialog"></dialog><div id="popover"></div><input id="email"><audit-state></audit-state>',
  )
  const win = dom.window
  Object.defineProperty(win.HTMLElement.prototype, 'attachInternals', {
    value: () => ({ states: new Set() }),
  })
  Object.defineProperty(win.HTMLElement.prototype, 'showPopover', {
    value: () => undefined,
  })
  Object.defineProperty(win.HTMLElement.prototype, 'hidePopover', {
    value: () => undefined,
  })
  Object.defineProperty(win.HTMLDialogElement.prototype, 'showModal', {
    value: () => undefined,
  })
  Object.defineProperty(win.HTMLDialogElement.prototype, 'close', {
    value: () => undefined,
  })
  Object.defineProperty(win.document, 'startViewTransition', {
    value: (options: { update: () => void }) => {
      options.update()
      return {
        ready: Promise.resolve(),
        finished: Promise.resolve(),
        skipTransition: vi.fn(),
      }
    },
  })
  const nativeQuery = win.document.querySelector.bind(win.document)
  win.document.querySelector = (selector: string) =>
    selector === ':interest-source'
      ? nativeQuery('#interest-source')
      : nativeQuery(selector)
  Object.assign(win, {
    __factory: () => ({
      select: (selector: string, context: Document | Element) =>
        Array.from(context.querySelectorAll(selector)),
      match: (selector: string, element: Element) => element.matches(selector),
    }),
    __competitor: { DOMSelector: Adapter },
    __adapter: Adapter,
  })
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', win.document)
  vi.stubGlobal('HTMLElement', win.HTMLElement)
  vi.stubGlobal('customElements', win.customElements)
  vi.stubGlobal('DOMParser', win.DOMParser)
  vi.stubGlobal('DOMException', win.DOMException)
  vi.stubGlobal('CSS', { supports: () => true })
  process.argv = [argv[0]!, 'selector-compatibility.mts']
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  process.argv = argv
  dom.window.close()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function run() {
  await import('../../../../scripts/repo/bench/selector-compatibility.mts')
}
test.each([false, true])(
  'executes real document shadow XML and API probes wrapped %s',
  async wrapped => {
    if (wrapped) {
      Object.assign(dom.window, { __adapter: { default: Adapter } })
      process.argv.push('--browser', '/fixture/chrome')
      state.interestError = true
    }
    await run()
    const report = JSON.parse(state.write.mock.calls[0]![1])
    expect(report.matrix).toHaveLength(15)
    expect(
      report.matrix.some(
        (row: { native: { error?: string } }) => row.native.error,
      ),
    ).toBe(true)
    expect(
      report.matrix.some(
        (row: { context: string }) => row.context === 'shadow',
      ),
    ).toBe(true)
    expect(report.xml).toHaveLength(2)
    expect(report.api).toHaveLength(5)
    expect(report.userState).toHaveLength(2)
    expect(report.transitions).toHaveLength(3)
    expect(report.interest.fixtureError).toBe(wrapped ? 'TimeoutError' : null)
    expect(state.aliases).toContain(null)
    expect(state.route).toHaveBeenCalled()
    expect(state.close).toHaveBeenCalledOnce()
  },
)
test.each(['empty', 'asset', 'imports'])(
  'closes invalid standalone bundle %s',
  async output => {
    state.output = output
    await expect(run()).rejects.toBeInstanceOf(Error)
    expect(state.bundleClose).toHaveBeenCalledOnce()
    expect(state.close).not.toHaveBeenCalled()
  },
)
test('rejects unexpected browser major and closes browser', async () => {
  state.version = '153.0'
  await expect(run()).rejects.toBeInstanceOf(Error)
  expect(state.close).toHaveBeenCalledOnce()
})
test('rejects invalid XML fixtures and closes browser', async () => {
  Object.assign(state.fixture, {
    xml: [{ name: 'invalid', html: '<', selectors: [] }],
  })
  await expect(run()).rejects.toBeInstanceOf(Error)
  expect(state.close).toHaveBeenCalledOnce()
})
test('rejects dependency metadata missing from ancestors', async () => {
  state.metadataError = true
  await expect(run()).rejects.toBeInstanceOf(Error)
  expect(state.write).not.toHaveBeenCalled()
})
