import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ScriptCoverageExecute } from '../../../../../scripts/repo/cover/scripts/run.mts'
import type { PythonFileCoverage } from '../../../../../scripts/repo/cover/scripts/python.mts'
import { expect, test, vi } from 'vitest'
import {
  runPythonScriptTests,
  checkPythonScriptCoverage,
} from '../../../../../scripts/repo/cover/scripts/python.mts'
import { fixture } from './fixture/input.mts'

test('Python runs offline from the pinned project with branch coverage and unittest discovery', () => {
  const execute = vi.fn<ScriptCoverageExecute>()
  runPythonScriptTests('/checkout', '/report', execute)
  expect(execute).toHaveBeenCalledTimes(2)
  expect(execute.mock.calls[0]![0]).toBe('/checkout/.cache/bin/uv')
  expect(execute.mock.calls[0]![1]).toEqual([
    'run',
    '--project',
    '/checkout/.config/model-training',
    '--locked',
    '--offline',
    'python',
    '-m',
    'coverage',
    'run',
    '--branch',
    '--source',
    'scripts/repo/pytorch',
    '--data-file',
    '/report/.coverage-python',
    '-m',
    'unittest',
    'discover',
    '-s',
    'test/repo/unit/pytorch',
    '-p',
    'test_*.py',
  ])
  expect(execute.mock.calls[1]![1]).toContain('json')
  expect(execute.mock.calls[0]![2]).toMatchObject({
    cwd: '/checkout',
    env: { UV_CACHE_DIR: '/checkout/.cache/uv' },
  })
})

test('each Python script requires measured lines and branches and may have no branches', () => {
  const input = fixture()
  const report: { files: Record<string, PythonFileCoverage> } = {
    files: {
      'scripts/trainer.py': {
        executed_lines: [1, 2],
        missing_lines: [],
        executed_branches: [[1, 2]],
        missing_branches: [],
      },
      'scripts/constants.py': {
        executed_lines: [],
        missing_lines: [],
        executed_branches: [],
        missing_branches: [],
      },
    },
  }
  writeFileSync(
    path.join(input.directory, 'python.json'),
    JSON.stringify(report),
  )
  const files = [
    path.join(input.root, 'scripts/trainer.py'),
    path.join(input.root, 'scripts/constants.py'),
  ]
  expect(checkPythonScriptCoverage(input.root, input.directory, files)).toEqual(
    files.map(file => ({ file, lines: 100, branches: 100 })),
  )
  expect(() =>
    checkPythonScriptCoverage(input.root, input.directory, [input.entry]),
  ).toThrow(
    expect.objectContaining({ code: 'ERR_SCRIPT_COVERAGE_PYTHON_MISSING' }),
  )
  report.files['scripts/trainer.py']!.missing_lines = [3]
  report.files['scripts/trainer.py']!.missing_branches = [[1, 4]]
  writeFileSync(
    path.join(input.directory, 'python.json'),
    JSON.stringify(report),
  )
  expect(() =>
    checkPythonScriptCoverage(input.root, input.directory, files),
  ).toThrow(
    expect.objectContaining({
      code: 'ERR_SCRIPT_COVERAGE_PYTHON',
      minimum: 98,
    }),
  )
})
