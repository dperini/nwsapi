import assert from 'node:assert/strict'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  changedFiles,
  comparisonBase,
  completePlan,
  gitLines,
  main,
  planCiTests,
  writeGithubPlan,
} from '../../../../scripts/repo/test/ci.mts'

const state = vi.hoisted(() => ({
  main: false,
  args: [] as string[],
  files: [] as string[],
  mergeBase: 'fixture-base',
  exitCode: undefined as number | undefined,
  git: vi.fn(),
  append: vi.fn(),
  run: vi.fn(),
  budget: vi.fn(async () => 0),
}))
vi.mock('node:child_process', () => ({ execFileSync: state.git }))
vi.mock('node:fs', () => ({ appendFileSync: state.append }))
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: (url: string) =>
    state.main && url.endsWith('/scripts/repo/test/ci.mts'),
  runNode: state.run,
}))
vi.mock('../../../../scripts/repo/lib/test-budget.mts', () => ({
  runBudgeted: state.budget,
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.main = false
  state.args = []
  state.files = []
  state.mergeBase = 'fixture-base'
  state.exitCode = undefined
  state.git
    .mockReset()
    .mockImplementation((_command: string, args: string[]) =>
      args[0] === 'merge-base' ? state.mergeBase : state.files.join('\r\n'),
    )
  state.budget.mockResolvedValue(0)
  const variables = [
    'CI',
    'GITHUB_BASE_REF',
    'GITHUB_EVENT_BEFORE',
    'GITHUB_OUTPUT',
  ]
  for (let i = 0, length = variables.length; i < length; i += 1) {
    vi.stubEnv(variables[i]!, '')
  }
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        if (property === 'argv') {
          return ['node', 'ci.mts', ...state.args]
        }
        return property === 'exitCode'
          ? state.exitCode
          : Reflect.get(target, property)
      },
      set(target, property, value) {
        if (property === 'exitCode') {
          state.exitCode = value
          return true
        }
        return Reflect.set(target, property, value)
      },
    }),
  )
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('an unavailable comparison runs every lane', () => {
  assert.deepEqual(completePlan(), {
    browser: true,
    fullNode: true,
    fuzz: true,
    node: true,
    package: true,
    relatedFiles: [],
    testFiles: [],
    upstream: true,
  })
})

test('documentation changes do not schedule runtime lanes', () => {
  assert.deepEqual(planCiTests(['docs/repo/testing/performance.md']), {
    browser: false,
    fullNode: false,
    fuzz: false,
    node: false,
    package: false,
    relatedFiles: [],
    testFiles: [],
    upstream: false,
  })
})

test('source changes schedule every runtime contract and full Node tests', () => {
  assert.deepEqual(planCiTests(['src/core/initialize/load.mts']), {
    browser: true,
    fullNode: true,
    fuzz: true,
    node: true,
    package: true,
    relatedFiles: [],
    testFiles: [],
    upstream: true,
  })
})

test('workflow and local action changes exercise every runtime lane', () => {
  for (const file of [
    '.github/workflows/ci.yml',
    '.github/actions/repo/upload-artifact/action.yml',
    'scripts/repo/ci/artifact/upload.mts',
  ]) {
    const plan = planCiTests([file])
    for (const lane of [
      'node',
      'fullNode',
      'browser',
      'package',
      'fuzz',
      'upstream',
    ] as const) {
      assert.equal(plan[lane], true, `${file}: ${lane}`)
    }
  }
})

test('a changed Node test runs only its tier', () => {
  const plan = planCiTests(['test/repo/unit/selector-comments.test.mts'])
  assert.equal(plan.node, true)
  assert.equal(plan.fullNode, false)
  assert.equal(plan.browser, false)
  assert.deepEqual(plan.testFiles, [
    'test/repo/unit/selector-comments.test.mts',
  ])
  assert.deepEqual(plan.relatedFiles, [])
})

test('changed helpers and repository scripts use dependency-related tests', () => {
  assert.deepEqual(
    planCiTests(['test/repo/integration/fixture/selector.mts']).relatedFiles,
    ['test/repo/integration/fixture/selector.mts'],
  )
  assert.deepEqual(
    planCiTests(['scripts/repo/lib/test-budget.mts']).relatedFiles,
    ['scripts/repo/lib/test-budget.mts'],
  )
})

test('browser and package fixtures select their distinct lanes', () => {
  assert.equal(
    planCiTests(['test/repo/e2e/selector-comments-browser.test.mts']).browser,
    true,
  )
  assert.equal(
    planCiTests(['test/repo/e2e/jsdom-adapter-package.mts']).package,
    true,
  )
})

test('Node provisioning and consumer changes run package interoperability', () => {
  for (const file of [
    '.config/node-interop.json',
    '.github/workflows/ci.yml',
    'scripts/repo/node.mts',
    'scripts/repo/setup/tools.mts',
    'scripts/repo/setup/download.mts',
    'scripts/repo/external-tools.mts',
    '.config/external-tools.json',
    '.github/workflows/ci-coverage.yml',
    'test/repo/e2e/fixture/node-interop.mts',
  ]) {
    assert.equal(planCiTests([file]).package, true, file)
  }
})

test('every shared and lane-specific driver selects its owning test contract', () => {
  const shared = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']
  for (let i = 0, length = shared.length; i < length; i += 1) {
    expect(planCiTests([shared[i]!]).fullNode).toBe(true)
  }
  const drivers = [
    ['scripts/repo/test.mts', 'fullNode'],
    ['scripts/repo/test/helper.mts', 'fullNode'],
    ['.config/repo/vitest.config.mts', 'fullNode'],
    ['.config/playwright.config.mts', 'browser'],
    ['.config/state-pseudos.config.mts', 'browser'],
    ['scripts/repo/browser.mts', 'browser'],
    ['scripts/repo/build/run.mts', 'package'],
    ['test/repo/fuzz/selectors.fuzz.mts', 'fuzz'],
    ['scripts/repo/fuzz.mts', 'fuzz'],
    ['test/repo/e2e/upstream/test.html', 'upstream'],
    ['scripts/repo/check/wpt/scope.mts', 'upstream'],
    ['upstream/wpt/selectors.html', 'upstream'],
  ] as const
  for (let i = 0, length = drivers.length; i < length; i += 1) {
    const [file, lane] = drivers[i]!
    expect(planCiTests([file])[lane]).toBe(true)
  }
  expect(planCiTests(['scripts\\repo\\fixture.js']).relatedFiles).toEqual([
    'scripts/repo/fixture.js',
  ])
})

test('comparison precedence honors explicit flags, pull request refs, event commits and local fallback', () => {
  state.args = ['--base', 'explicit']
  expect(comparisonBase()).toBe('explicit')
  state.args = ['--base']
  expect(comparisonBase()).toBeUndefined()
  state.args = []
  vi.stubEnv('GITHUB_BASE_REF', 'master')
  expect(comparisonBase()).toBe('origin/master')
  vi.stubEnv('GITHUB_BASE_REF', '')
  vi.stubEnv('GITHUB_EVENT_BEFORE', 'a'.repeat(40))
  expect(comparisonBase()).toBe('a'.repeat(40))
  vi.stubEnv('GITHUB_EVENT_BEFORE', '0'.repeat(40))
  expect(comparisonBase()).toBe('HEAD^')
  vi.stubEnv('CI', 'true')
  expect(comparisonBase()).toBeUndefined()
})

test('change discovery rejects missing bases and command failures instead of narrowing test coverage', () => {
  state.files = ['src/fixture.mts', '', 'docs/fixture.md']
  expect(gitLines(['diff'])).toEqual(['src/fixture.mts', 'docs/fixture.md'])
  expect(changedFiles()).toEqual({
    files: ['src/fixture.mts', 'docs/fixture.md'],
    reliable: true,
  })
  state.mergeBase = ''
  expect(changedFiles()).toEqual({ files: [], reliable: false })
  state.git.mockImplementation(() => {
    throw new Error('fixture')
  })
  expect(changedFiles()).toEqual({ files: [], reliable: false })
  vi.stubEnv('CI', 'true')
  expect(changedFiles()).toEqual({ files: [], reliable: false })
})

test('GitHub output records parsed lane booleans and requires its destination', async () => {
  expect(() => writeGithubPlan(completePlan())).toThrow()
  vi.stubEnv('GITHUB_OUTPUT', '/fixture/github-output')
  writeGithubPlan(completePlan())
  const values = Object.fromEntries(
    state.append.mock.calls[0]![1].trim()
      .split('\n')
      .map((line: string) => line.split('=')),
  )
  expect(values).toEqual({
    browser: 'true',
    fuzz: 'true',
    node: 'true',
    package: 'true',
    upstream: 'true',
  })
  state.args = ['--github-output']
  await main()
  expect(state.run).not.toHaveBeenCalled()
})

test('the CI runner builds only affected work then schedules full or targeted tiers', async () => {
  state.files = ['docs/fixture.md']
  await main()
  expect(state.run).not.toHaveBeenCalled()
  state.files = ['src/fixture.mts']
  await main()
  expect(state.run.mock.calls.map(call => call[1])).toEqual([
    undefined,
    ['all'],
  ])
  state.run.mockClear()
  state.files = [
    'test/repo/unit/fixture.test.mts',
    'test/repo/integration/fixture.test.mts',
    'scripts/repo/fixture.mts',
  ]
  await main()
  expect(state.run.mock.calls.map(call => call[1])).toEqual([
    undefined,
    ['unit', 'test/repo/unit/fixture.test.mts'],
    ['integration', 'test/repo/integration/fixture.test.mts'],
  ])
  expect(state.budget).toHaveBeenCalledWith(
    expect.arrayContaining(['related', 'scripts/repo/fixture.mts']),
    60_000,
    'related',
  )
  state.files = ['scripts/repo/fixture.mts']
  state.budget.mockResolvedValue(3)
  await main()
  expect(state.exitCode).toBe(3)
})

test('unreliable change discovery and the command entrypoint run the complete Node plan', async () => {
  vi.stubEnv('CI', 'true')
  await main()
  expect(state.run).toHaveBeenLastCalledWith(expect.any(String), ['all'])
  state.run.mockClear()
  state.main = true
  vi.resetModules()
  await import('../../../../scripts/repo/test/ci.mts')
  expect(state.run).toHaveBeenLastCalledWith(expect.any(String), ['all'])
})
