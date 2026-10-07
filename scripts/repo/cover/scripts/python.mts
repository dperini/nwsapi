import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import manifest from '../../../../.config/external-tools.json' with { type: 'json' }
import { SCRIPT_COVERAGE_MINIMUM } from './report.mts'
import type { ScriptCoverageExecute } from './run.mts'

export interface PythonFileCoverage {
  executed_lines: number[]
  missing_lines: number[]
  executed_branches: Array<[number, number]>
  missing_branches: Array<[number, number]>
}

export function runPythonScriptTests(
  root: string,
  directory: string,
  execute: ScriptCoverageExecute = execFileSync,
) {
  const command = path.join(root, '.cache/bin/uv')
  const project = path.join(root, manifest.tools.pytorch.project)
  const data = path.join(directory, '.coverage-python')
  const common = [
    'run',
    '--project',
    project,
    '--locked',
    '--offline',
    'python',
    '-m',
    'coverage',
  ]
  const options = {
    cwd: root,
    stdio: 'inherit' as const,
    env: { ...process.env, UV_CACHE_DIR: path.join(root, '.cache/uv') },
  }
  execute(
    command,
    [
      ...common,
      'run',
      '--branch',
      '--source',
      'scripts/repo/pytorch',
      '--data-file',
      data,
      '-m',
      'unittest',
      'discover',
      '-s',
      'test/repo/unit/pytorch',
      '-p',
      'test_*.py',
    ],
    options,
  )
  execute(
    command,
    [
      ...common,
      'json',
      '--data-file',
      data,
      '-o',
      path.join(directory, 'python.json'),
    ],
    options,
  )
}

export function checkPythonScriptCoverage(
  root: string,
  directory: string,
  inventory: string[],
) {
  const data = JSON.parse(
    readFileSync(path.join(directory, 'python.json'), 'utf8'),
  ) as { files: Record<string, PythonFileCoverage> }
  const summaries = inventory.map(file => {
    const item = data.files[path.relative(root, file).replaceAll('\\', '/')]
    if (item === undefined) {
      throw Object.assign(
        new Error('Python script is missing from execution coverage.'),
        { code: 'ERR_SCRIPT_COVERAGE_PYTHON_MISSING', file },
      )
    }
    const percent = (covered: number, missing: number) =>
      covered + missing ? (100 * covered) / (covered + missing) : 100
    return {
      file,
      lines: percent(item.executed_lines.length, item.missing_lines.length),
      branches: percent(
        item.executed_branches.length,
        item.missing_branches.length,
      ),
    }
  })
  const failures = summaries.filter(
    item =>
      item.lines < SCRIPT_COVERAGE_MINIMUM ||
      item.branches < SCRIPT_COVERAGE_MINIMUM,
  )
  if (failures.length) {
    throw Object.assign(
      new Error('Python script coverage is below the required minimum.'),
      {
        code: 'ERR_SCRIPT_COVERAGE_PYTHON',
        minimum: SCRIPT_COVERAGE_MINIMUM,
        failures,
      },
    )
  }
  return summaries
}
