import { parse } from 'acorn'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, expect, test, vi } from 'vitest'
import setup, {
  checkWptScope,
  discardedRead,
  inspectScript,
  inspectWptScope,
  resourceUrl,
  staticName,
} from '../../../../../scripts/repo/check/wpt/scope.mts'
import type * as RepoPaths from '../../../../../scripts/repo/lib/paths.mts'
import type * as NodeRunner from '../../../../../scripts/repo/lib/run-node.mts'

const state = vi.hoisted(() => ({
  root: '/tmp/nwsapi-scope-test-' + process.pid,
  main: false,
}))
vi.mock('../../../../../scripts/repo/lib/paths.mts', async importOriginal => ({
  ...(await importOriginal<typeof RepoPaths>()),
  REPO_ROOT: state.root,
}))
vi.mock(
  '../../../../../scripts/repo/lib/run-node.mts',
  async importOriginal => ({
    ...(await importOriginal<typeof NodeRunner>()),
    isMainModule: (url: string) =>
      state.main && url.endsWith('/check/wpt/scope.mts'),
  }),
)
vi.mock('../../../../../test/repo/e2e/upstream/manifest.mts', () => ({
  manifest: [
    { path: '/page.html', note: 'Fixture.' },
    { path: '/second.html', note: 'Shared helper fixture.' },
  ],
}))

const checkout = path.join(state.root, 'upstream/wpt')
mkdirSync(checkout, { recursive: true })
afterAll(() => rmSync(state.root, { recursive: true, force: true }))

function validSources() {
  const page =
    '<link rel="stylesheet" href="styles.css"><script src="/resources/testharness.js"></script><script src="/resources/testharnessreport.js"></script><script></script><script type="module" src="one.mjs"></script><script type="module" src="one.mjs"></script><script type="application/json">{"offsetWidth": true}</script><body onload="import(\'./one.mjs\')"><iframe></iframe><iframe src="about:blank"></iframe><iframe src="frame.html"></iframe><iframe src="frame.html"></iframe><iframe srcdoc="&lt;p&gt;plain&lt;/p&gt;"></iframe>'
  writeFileSync(path.join(checkout, 'page.html'), page)
  writeFileSync(path.join(checkout, 'second.html'), page)
  writeFileSync(
    path.join(checkout, 'one.mjs'),
    'import "./two.mjs"; node.matches("div")',
  )
  writeFileSync(
    path.join(checkout, 'two.mjs'),
    'import "./one.mjs"; node.querySelector("p")',
  )
  writeFileSync(
    path.join(checkout, 'frame.html'),
    '<link rel="match" href="other.html"><script type="module">import "./one.mjs"</script>',
  )
}

test('scope checks inspect circular module helpers, handlers and shared frame dependencies', () => {
  validSources()
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const result = checkWptScope()
  expect(result).toEqual({ pages: 2, scripts: 2, issues: [] })
  setup()
  expect(log).toHaveBeenCalledTimes(2)
  writeFileSync(
    path.join(checkout, 'page.html'),
    '<script src="/resources/testharness.js"></script><script>assert_equals(node.offsetWidth, 1)</script>',
  )
  expect(() => checkWptScope()).toThrow()
})

test('script inspection preserves static dependencies and distinguishes unknown computed members', () => {
  const result = inspectScript(
    'export const value = 1; export * from "./one.mjs"; import(`./two.mjs`); node[method]("div"); node[123](); const element = document.createElement("div"); void node?.offsetWidth;',
    'module.mjs',
    true,
  )
  expect(result.imports).toEqual(['./one.mjs', './two.mjs'])
  expect(result.issues).toEqual([])
  const ast = parse('const value = 1', { ecmaVersion: 'latest' })
  expect(staticName(ast)).toBeUndefined()
  expect(discardedRead(ast, [])).toBe(false)
  const tagged = parse('tag`\\unicode`', { ecmaVersion: 'latest' }).body[0]
  if (
    tagged?.type !== 'ExpressionStatement' ||
    tagged.expression.type !== 'TaggedTemplateExpression'
  ) {
    throw new Error('Expected a tagged template fixture.')
  }
  expect(staticName(tagged.expression.quasi)).toBeUndefined()
  expect(resourceUrl('../helper.js?query', '/css/page.html')).toBe('/helper.js')
  expect(() =>
    resourceUrl('https://other.test/helper.js', '/page.html'),
  ).toThrow()
})

test('parsing pages inspect the local syntax helper instead of the native CSSOM helper', () => {
  const helper = path.join(
    state.root,
    'test/repo/e2e/fixture/upstream/parsing-helpers.js',
  )
  mkdirSync(path.dirname(helper), { recursive: true })
  writeFileSync(helper, 'document.querySelector("div")')
  writeFileSync(
    path.join(checkout, 'parse.html'),
    '<script src="/resources/testharness.js"></script><script src="/css/support/parsing-testcommon.js"></script>',
  )
  expect(
    inspectWptScope([
      { path: '/parse.html', note: 'Parsing fixture.', parsing: true },
    ]),
  ).toEqual({ pages: 1, scripts: 1, issues: [] })
})

test('scope CLI rejects extra arguments and checks the selected default pages', async () => {
  validSources()
  const argv = process.argv
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.main = true
  try {
    process.argv = ['node', 'scope.mts', '--unknown']
    vi.resetModules()
    await expect(
      import('../../../../../scripts/repo/check/wpt/scope.mts'),
    ).rejects.toThrow()
    process.argv = ['node', 'scope.mts']
    vi.resetModules()
    await import('../../../../../scripts/repo/check/wpt/scope.mts')
  } finally {
    process.argv = argv
    state.main = false
  }
})
