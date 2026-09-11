import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'

test('process rules distinguish discarded array work and sync exit-status access', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-process-lint-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const cases = [
    ['array-inline', '[1].map(async x => x)', 'no-map-async-callback'],
    [
      'array-binding',
      'const items = [1]; items.map(async x => x)',
      'no-map-async-callback',
    ],
    [
      'array-custom',
      'const items = { map: async callback => callback(1) }; items.map(async x => x)',
      null,
    ],
    [
      'array-shadow',
      'const items = [1]; function run(items) { items.map(async x => x) }',
      null,
    ],
    [
      'array-reassigned',
      'let items = [1]; items = custom; items.map(async x => x)',
      null,
    ],
    ['array-awaited', 'await Promise.all([1].map(async x => x))', null],
    ['array-returned', 'function run() { return [1].map(async x => x) }', null],
    ['array-assigned', 'const work = [1].map(async x => x)', null],
    ['array-sync', '[1].map(x => x)', null],
    ['spawn-inline', 'spawnSync("node").code', 'no-spawnsync-code-property'],
    [
      'spawn-binding',
      'const result = child.spawnSync("node"); result.code',
      'no-spawnsync-code-property',
    ],
    [
      'spawn-computed',
      'const result = spawnSync("node"); result["code"]',
      'no-spawnsync-code-property',
    ],
    [
      'spawn-closure',
      'const result = spawnSync("node"); function run() { return result.code }',
      'no-spawnsync-code-property',
    ],
    [
      'spawn-shadow',
      'const result = spawnSync("node"); function run(result) { return result.code }',
      null,
    ],
    [
      'spawn-reassigned',
      'let result = spawnSync("node"); result = other; result.code',
      null,
    ],
    ['spawn-status', 'spawnSync("node").status', null],
    ['spawn-error', 'spawnSync("node").error.code', null],
    ['spawn-async', 'const result = spawn("node"); result.code', null],
    [
      'spawn-suppressed',
      '// oxlint-disable-next-line nwsapi/no-spawnsync-code-property -- Test a legacy integration shape.\nspawnSync("node").code',
      null,
    ],
  ] as const
  const files = cases.map(([name, code]) => {
    const file = path.join(root, `${name}.mts`)
    writeFileSync(file, code)
    return file
  })
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/oxlint/bin/oxlint',
      '--config',
      '.config/oxlint.json',
      '--format',
      'json',
      ...files,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  const report = JSON.parse(result.stdout) as {
    diagnostics: Array<{ code: string; filename: string }>
  }
  const actual = report.diagnostics
    .filter(item =>
      [
        'nwsapi(no-map-async-callback)',
        'nwsapi(no-spawnsync-code-property)',
      ].includes(item.code),
    )
    .map(item => `${path.basename(item.filename, '.mts')}:${item.code}`)
    .toSorted()
  const expected = cases
    .filter(item => item[2])
    .map(([name, , rule]) => `${name}:nwsapi(${rule})`)
    .toSorted()
  expect(actual).toEqual(expected)
})
