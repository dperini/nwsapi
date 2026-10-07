import { nativeBrowserArgs } from '../../../../../../scripts/repo/check/wpt/native/browser.mts'
import { missingNativeCandidates } from '../../../../../../scripts/repo/check/wpt/native/run.mts'
import { expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CHROME_VERSION } from '../../../../../../scripts/repo/browser.mts'
import type * as NodeRunner from '../../../../../../scripts/repo/lib/run-node.mts'
import {
  passingUniverse,
  narrowUniverse,
  nativePins,
  type NativePlan,
  type NativeReport,
} from '../../../../../../scripts/repo/check/wpt/native/pool.mts'
import {
  classifyScript,
  manifestSources,
} from '../../../../../../scripts/repo/check/wpt/native/scope.mts'

const state = vi.hoisted(() => ({
  revision: 'a'.repeat(40),
  checkout: 'a'.repeat(40),
  main: false,
}))
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((_command: string, args: string[]) =>
    args.includes('config') ? state.revision : state.checkout,
  ),
}))
vi.mock(
  '../../../../../../scripts/repo/lib/run-node.mts',
  async importOriginal => ({
    ...(await importOriginal<typeof NodeRunner>()),
    isMainModule: (url: string) =>
      state.main && url.endsWith('/native/pool.mts'),
  }),
)

const pins = { browser: CHROME_VERSION, revision: 'a'.repeat(40) }
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

test('qualification rejects malformed plans and unfinished report metadata', () => {
  const changes = [
    { scope: 'other' },
    { experimental: true },
    { featurePolicy: 'other' },
    { browser: 'other' },
    { revision: 'other' },
    { tests: [] },
    { tests: [plan.tests[0], plan.tests[0]] },
  ]
  for (let i = 0, length = changes.length; i < length; i += 1) {
    expect(() =>
      passingUniverse(
        Object.assign(structuredClone(plan), changes[i]),
        [report()],
        pins,
      ),
    ).toThrow()
  }
  expect(() => passingUniverse(plan, [], pins)).toThrow()
  const reportChanges = [
    { product: 'firefox' },
    { browser_version: 'other' },
    { revision: 'other' },
  ]
  for (let i = 0, length = reportChanges.length; i < length; i += 1) {
    const changed = report()
    Object.assign(changed.run_info, reportChanges[i])
    expect(() => passingUniverse(plan, [changed], pins)).toThrow()
  }
  const times = [{ time_start: NaN }, { time_end: Infinity }, { time_end: 0 }]
  for (let i = 0, length = times.length; i < length; i += 1) {
    expect(() =>
      passingUniverse(plan, [Object.assign(report(), times[i])], pins),
    ).toThrow()
  }
})

test('disabled skip results are excluded and unplanned results cannot enter the pool', () => {
  const disabled = {
    test: '/disabled.html',
    subsuite: 'optional',
    type: 'testharness',
    disabled: true,
  }
  const disabledPlan = { ...plan, tests: [...plan.tests, disabled] }
  const results = report()
  results.results.push({
    test: disabled.test,
    subsuite: disabled.subsuite,
    status: 'SKIP',
    subtests: [],
  })
  expect(passingUniverse(disabledPlan, [results], pins)).toMatchObject({
    disabled: 1,
    planned: 2,
  })
  results.results.at(-1)!.status = 'NOTRUN'
  expect(passingUniverse(disabledPlan, [results], pins).cases).toHaveLength(2)
  results.results.at(-1)!.status = 'OK'
  expect(() => passingUniverse(disabledPlan, [results], pins)).toThrow()
})

test('scope reviews require a passing harness assertion, a reason and a unique supported kind', () => {
  const pool = passingUniverse(plan, [report()], pins)
  const review = {
    test: '/dom.html',
    subsuite: '',
    subtest: 'selector',
    kind: 'selector-matching' as const,
    reason: 'Direct matching assertion.',
  }
  expect(() =>
    narrowUniverse(pool, [{ ...review, test: '/render.html', subtest: null }]),
  ).toThrow()
  expect(() => narrowUniverse(pool, [{ ...review, reason: ' ' }])).toThrow()
  expect(() =>
    narrowUniverse(pool, [
      JSON.parse(JSON.stringify({ ...review, kind: 'other' })),
    ]),
  ).toThrow()
  expect(() => narrowUniverse(pool, [review, review])).toThrow()
})

test('native pin verification requires the checkout to match its configured revision', () => {
  expect(nativePins()).toEqual(pins)
  state.checkout = 'different'
  expect(() => nativePins()).toThrow()
  state.checkout = state.revision
})

test('pool CLI validates inputs, publishes digests and applies optional selector review', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-pool-cli-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }))
  const planFile = path.join(directory, 'plan.json')
  const reportFile = path.join(directory, 'report.json')
  const reviewFile = path.join(directory, 'review.json')
  const output = path.join(directory, 'pool.json')
  writeFileSync(planFile, JSON.stringify(plan))
  writeFileSync(reportFile, JSON.stringify(report()))
  writeFileSync(
    reviewFile,
    JSON.stringify([
      {
        test: '/dom.html',
        subsuite: '',
        subtest: 'selector',
        kind: 'selector-matching',
        reason: 'Direct selector assertion.',
      },
    ]),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const argv = process.argv
  state.main = true
  try {
    const invalid = [
      [],
      ['--plan', planFile],
      ['--plan', planFile, '--report', reportFile],
    ]
    for (let i = 0, length = invalid.length; i < length; i += 1) {
      process.argv = ['node', 'pool.mts', ...invalid[i]!]
      vi.resetModules()
      await expect(
        import('../../../../../../scripts/repo/check/wpt/native/pool.mts'),
      ).rejects.toThrow()
    }
    const options = [
      '--plan',
      planFile,
      '--report',
      reportFile,
      '--output',
      output,
    ]
    process.argv = ['node', 'pool.mts', ...options]
    vi.resetModules()
    await import('../../../../../../scripts/repo/check/wpt/native/pool.mts')
    expect(JSON.parse(readFileSync(output, 'utf8')).cases).toHaveLength(2)
    process.argv = ['node', 'pool.mts', ...options, '--review', reviewFile]
    vi.resetModules()
    await import('../../../../../../scripts/repo/check/wpt/native/pool.mts')
    const reviewed = JSON.parse(readFileSync(output, 'utf8'))
    expect(reviewed.cases).toHaveLength(1)
    expect(
      reviewed.inputs.map((input: { file: string }) => input.file),
    ).toEqual([planFile, reportFile])
    expect(
      reviewed.inputs.every(
        (input: { sha256: string }) => input.sha256.length === 64,
      ),
    ).toBe(true)
  } finally {
    process.argv = argv
    state.main = false
  }
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
