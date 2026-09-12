import { nativeBrowserArgs } from '../../../../../../scripts/repo/check/wpt/native/browser.mts'
import { missingNativeCandidates } from '../../../../../../scripts/repo/check/wpt/native/run.mts'
import { expect, test } from 'vitest'
import {
  passingUniverse,
  narrowUniverse,
  type NativePlan,
  type NativeReport,
} from '../../../../../../scripts/repo/check/wpt/native/pool.mts'
import {
  classifyScript,
  manifestSources,
} from '../../../../../../scripts/repo/check/wpt/native/scope.mts'

const pins = { browser: '154.0.8037.0', revision: 'a'.repeat(40) }
const plan: NativePlan = {
  ...pins,
  scope: 'selector-candidates',
  experimental: false,
  featurePolicy: 'browser-defaults',
  tests: [
    { test: '/render.html', type: 'reftest', subsuite: '', disabled: false },
    { test: '/dom.html', type: 'testharness', subsuite: '', disabled: false },
  ],
}
const report = (): NativeReport => ({
  run_info: {
    browser_version: pins.browser,
    revision: pins.revision,
    product: 'chrome',
  },
  time_start: 1,
  time_end: 2,
  results: [
    { test: '/render.html', status: 'PASS', subtests: [] },
    {
      test: '/dom.html',
      status: 'OK',
      subtests: [
        { name: 'selector', status: 'PASS' },
        { name: 'future', status: 'FAIL' },
      ],
    },
  ],
})

test('resuming discovery selects only URLs absent from recorded execution plans', () => {
  expect(
    missingNativeCandidates(
      [{ test: '/dom.html' }, { test: '/new.html' }],
      [plan],
    ),
  ).toEqual([{ test: '/new.html' }])
  const first = report()
  const second = report()
  first.results = first.results.slice(0, 1)
  second.results = second.results.slice(1)
  expect(passingUniverse(plan, [first, second], pins).cases).toHaveLength(2)
})

test('native passes include rendering before selector scope is applied', () => {
  const pool = passingUniverse(plan, [report()], pins)
  expect(pool.cases.map(item => item.test)).toEqual([
    '/dom.html',
    '/render.html',
  ])
  const review = {
    test: '/dom.html',
    subsuite: '',
    subtest: 'selector',
    kind: 'selector-matching' as const,
    reason: 'Direct selector assertion.',
  }
  expect(narrowUniverse(pool, [review]).cases).toHaveLength(1)
  expect(() =>
    narrowUniverse(pool, [{ ...review, subtest: 'future' }]),
  ).toThrow()
})

test('native qualification rejects partial runs and mismatched pins', () => {
  const partial = report()
  partial.results.pop()
  expect(() => passingUniverse(plan, [partial], pins)).toThrow(
    'Incomplete native run',
  )
  const wrong = report()
  wrong.run_info.browser_version = '153.0.8010.36'
  expect(() => passingUniverse(plan, [wrong], pins)).toThrow('pins')
  expect(() =>
    passingUniverse(plan, [report()], { ...pins, revision: 'b'.repeat(40) }),
  ).toThrow('exact browser')
})

test('native failures cannot become passes through retries or failed harnesses', () => {
  const failing = report()
  failing.results[1]!.status = 'TIMEOUT'
  for (const reports of [
    [report(), failing],
    [failing, report()],
  ]) {
    expect(
      passingUniverse(plan, reports, pins).cases.map(item => item.test),
    ).toEqual(['/render.html'])
  }
  const retry = report()
  retry.results[1]!.subtests[1]!.status = 'PASS'
  expect(passingUniverse(plan, [report(), retry], pins).cases).toHaveLength(2)
})

test('scope uses selector assertions rather than comments or fixture lookups', () => {
  const found = classifyScript(
    `
    test(() => assert_true(node.matches('.active')), 'selector');
    test(() => assert_equals(document.querySelector('#fixture').textContent, 'text'), 'fixture');
    test(() => assert_equals(getComputedStyle(node).color, 'red'), 'render');
    // test(() => assert_true(node.matches('x')), 'comment')
  `,
    'test.js',
  )
  expect([...found.keys()]).toEqual(['selector'])
})

test('native URL variants map through upstream manifest metadata', () => {
  const sources = manifestSources({
    testharness: {
      dom: {
        'case.any.js': [
          'blob',
          ['/dom/case.any.html', {}],
          ['/dom/case.any.worker.html?variant', {}],
        ],
        'plain.html': ['blob', [null, {}]],
      },
    },
  })
  expect(sources.get('/dom/case.any.worker.html?variant')).toBe(
    'dom/case.any.js',
  )
  expect(sources.get('/dom/plain.html')).toBe('dom/plain.html')
})

test('native launcher removes merged feature overrides and keeps transport flags', () => {
  expect(
    nativeBrowserArgs([
      '--enable-features=A,B,',
      '--enable-blink-features=MojoJS,',
      '--disable-features=X',
      '--enable-experimental-web-platform-features',
      '--headless=new',
      '--remote-debugging-pipe',
    ]),
  ).toEqual(['--headless=new', '--remote-debugging-pipe'])
})

test('discovery reads selector metadata and script dependencies before browser qualification', async () => {
  const { discoveryMetadata } =
    await import('../../../../../../scripts/repo/check/wpt/native/discovery.mts')
  const result = discoveryMetadata(
    `<link rel="help" href="https://drafts.csswg.org/selectors-4/#relational"><script src="helper.js"></script>`,
    'case.html',
  )
  expect(result.reasons).toContain('Selector specification help link.')
  expect(result.dependencies).toEqual(['helper.js'])
  expect(discoveryMetadata('// querySelector("x")', 'case.js').reasons).toEqual(
    [],
  )
  expect(
    discoveryMetadata('// META: script=helper.js', 'case.any.js').dependencies,
  ).toEqual(['helper.js'])
})
