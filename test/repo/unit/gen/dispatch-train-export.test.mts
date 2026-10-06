import { expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'

const repository = process.cwd()

test('the Python trainer emits guarded, low complexity route helpers', () => {
  const result = spawnSync(
    'python3',
    [
      '-c',
      [
        'import json, sys',
        'from pathlib import Path',
        'sys.path.insert(0, str(Path("scripts/repo/pytorch").resolve()))',
        'from route_policy import input_guard_lines',
        'domain = [[32, 80, 0, 0, 2.5], [192, 768, 3, 1, 4]]',
        'print(json.dumps(input_guard_lines(domain, [[1, 0], [2, 0]])))',
      ].join('\n'),
    ],
    { cwd: repository, encoding: 'utf8' },
  )
  expect(result.status, result.stderr).toBe(0)

  const guardSource = JSON.parse(result.stdout) as string[]
  const supportedInputs = vm.runInNewContext(
    `${guardSource.join('\n')}\nsupportedInputs`,
  ) as (...features: number[]) => boolean

  expect(supportedInputs(96, 320, 1, 0, 3.3)).toBe(true)
  expect(supportedInputs(96, 100, 1, 0, 3.3)).toBe(false)
  expect(supportedInputs(96, 320, 3, 0, 3.3)).toBe(false)
  expect(supportedInputs(12, 320, 1, 0, 3.3)).toBe(false)
  expect(supportedInputs(Number.NaN, 320, 1, 0, 3.3)).toBe(false)
})
