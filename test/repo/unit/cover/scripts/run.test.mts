import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const state = vi.hoisted(() => ({
  execute: vi.fn(),
  mkdir: vi.fn(),
  remove: vi.fn(),
  collect: vi.fn(async () => ({
    coverage: {},
    inventory: { node: ['script'], python: ['trainer'] },
  })),
  write: vi.fn(() => ({
    lines: { pct: 100 },
    statements: { pct: 100 },
    functions: { pct: 100 },
    branches: { pct: 100 },
  })),
  check: vi.fn(),
  python: vi.fn(),
  checkPython: vi.fn(),
}))
vi.mock('node:child_process', () => ({ execFileSync: state.execute }))
vi.mock('node:fs', () => ({ mkdirSync: state.mkdir, rmSync: state.remove }))
vi.mock('../../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => false,
}))
vi.mock('../../../../../scripts/repo/cover/scripts/report.mts', () => ({
  collectScriptCoverage: state.collect,
  writeScriptCoverage: state.write,
  checkScriptCoverage: state.check,
}))
vi.mock('../../../../../scripts/repo/cover/scripts/python.mts', () => ({
  runPythonScriptTests: state.python,
  checkPythonScriptCoverage: state.checkPython,
}))
import {
  main,
  runScriptTests,
} from '../../../../../scripts/repo/cover/scripts/run.mts'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

test('coverage runs both tiers with native collection and transformed worker markers', () => {
  runScriptTests('/checkout', '/checkout/coverage/scripts')
  expect(state.remove).toHaveBeenCalledWith('/checkout/coverage/scripts', {
    recursive: true,
    force: true,
  })
  expect(
    state.execute.mock.calls.map(call => call[2].env.NWSAPI_TEST_TIER),
  ).toEqual(['unit', 'integration'])
  expect(state.execute.mock.calls[0]![2]).toMatchObject({
    cwd: '/checkout',
    env: {
      NODE_DISABLE_COMPILE_CACHE: '1',
      NODE_V8_COVERAGE: '/checkout/coverage/scripts/raw',
      NWSAPI_SCRIPT_COVERAGE_TRANSFORMED:
        '/checkout/coverage/scripts/transformed',
      NWSAPI_SCRIPT_COVERAGE_REPORT: '/checkout/coverage/scripts/unit',
    },
  })
})

test('help does not start tests or parse unrelated flags', async () => {
  await main(['--help'])
  await main(['-h'])
  expect(state.execute).not.toHaveBeenCalled()
  expect(state.collect).not.toHaveBeenCalled()
})

test('normal coverage runs collect reports and enforce both language gates', async () => {
  await main([])
  expect(state.execute).toHaveBeenCalledTimes(2)
  expect(state.python).toHaveBeenCalledOnce()
  expect(state.check).toHaveBeenCalledOnce()
  expect(state.checkPython).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    ['trainer'],
  )
})

test('analyze reuses reports and the default arguments come from the process', async () => {
  vi.stubGlobal(
    'process',
    new Proxy(process, {
      get(target, property) {
        return property === 'argv'
          ? ['node', 'run.mts', '--analyze']
          : Reflect.get(target, property)
      },
    }),
  )
  await main()
  expect(state.execute).not.toHaveBeenCalled()
  expect(state.python).not.toHaveBeenCalled()
  expect(state.collect).toHaveBeenCalledOnce()
})

test('unknown options and failed test commands cannot produce a passing report', async () => {
  await expect(main(['--unknown'])).rejects.toMatchObject({
    code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION',
  })
  const execute = vi.fn(() => {
    throw Object.assign(new Error('fixture'), { code: 'ERR_TEST_FIXTURE' })
  })
  expect(() => runScriptTests('/checkout', '/report', execute)).toThrow(
    expect.objectContaining({ code: 'ERR_TEST_FIXTURE' }),
  )
  expect(execute).toHaveBeenCalledOnce()
})
