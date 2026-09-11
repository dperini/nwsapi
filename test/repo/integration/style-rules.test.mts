import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'

const rules = [
  'eslint/complexity',
  'eslint/curly',
  'nwsapi/max-comment-block-lines',
  'nwsapi/no-comment-glob-star-slash',
  'nwsapi/no-minified-bundler-output',
  'nwsapi/no-process-chdir',
]

test('the style profile reports violations and accepts repaired code', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-style-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const files = {
    'complexity.mts': `export function choose(value) { ${Array.from({ length: 16 }, (_, i) => `if (value === ${i}) { return ${i} }`).join('\n')} return -1 }`,
    'conditional.mts':
      'export function choose(value) { if (value) return 1; return 0 }',
    'comments.mts':
      '\n'.repeat(25) +
      '// Explain a constraint.\n'.repeat(21) +
      'export const marker = 1',
    'glob.mts': '/** Match **\\/example. */\nexport const marker = 1',
    'rolldown.config.mts':
      "import { build } from 'rolldown'; void build({ output: { minify: true } })",
    'working-directory.mts': "process.chdir('/tmp')",
  }
  const paths = Object.entries(files).map(([name, source]) => {
    const file = path.join(root, name)
    writeFileSync(file, source)
    return file
  })
  const lint = (targets: string[], fix = false) => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/oxlint/bin/oxlint',
        '--config',
        '.config/oxlint.json',
        '--format',
        'json',
        ...(fix ? ['--fix'] : []),
        ...targets,
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
    expect(result.error).toBeUndefined()
    const report = JSON.parse(result.stdout) as {
      diagnostics: Array<{ code: string }>
    }
    return {
      status: result.status,
      codes: report.diagnostics.map(item => item.code).toSorted(),
    }
  }
  const rejected = lint(paths)
  expect(rejected.status).toBe(1)
  expect(rejected.codes).toEqual(
    rules.map(rule => rule.replace('/', '(') + ')').toSorted(),
  )
  const fixed = [
    path.join(root, 'glob.mts'),
    path.join(root, 'rolldown.config.mts'),
  ]
  lint(fixed, true)
  writeFileSync(paths[0]!, 'export function choose(value) { return value }')
  writeFileSync(
    paths[1]!,
    'export function choose(value) { if (value) { return 1 } return 0 }',
  )
  writeFileSync(
    paths[2]!,
    '// Keep the required constraint.\nexport const marker = 1',
  )
  writeFileSync(paths[5]!, "export const options = { cwd: '/tmp' }")
  expect(lint(paths)).toEqual({ status: 0, codes: [] })
})

test('module size checks boundaries and permits justified hard-cap exceptions only', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-module-size-'))
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const cases = [
    { name: 'at-soft', lines: 500, marker: '', expected: false },
    { name: 'over-soft', lines: 501, marker: '', expected: true },
    { name: 'at-hard', lines: 1000, marker: '', expected: true },
    { name: 'over-hard', lines: 1001, marker: '', expected: true },
    {
      name: 'soft-marker',
      lines: 501,
      marker:
        '// max-file-lines: table — An exhaustive table must stay together.',
      expected: true,
    },
    {
      name: 'hard-marker',
      lines: 1001,
      marker:
        '// max-file-lines: table — An exhaustive table must stay together.',
      expected: false,
    },
    {
      name: 'invalid-marker',
      lines: 1001,
      marker: '// max-file-lines: legitimate — This file is large.',
      expected: true,
    },
  ]
  const targets = cases.map(item => {
    const file = path.join(root, item.name + '.mts')
    const content = Array<string>(item.lines).fill('')
    content[0] = item.marker
    content[item.lines - 1] = 'export const value = 1'
    writeFileSync(file, content.join('\n'))
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
      ...targets,
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  expect(result.error).toBeUndefined()
  expect(result.status).toBe(1)
  const report = JSON.parse(result.stdout) as {
    diagnostics: Array<{ code: string; filename: string }>
  }
  const violations = report.diagnostics.filter(
    item => item.code === 'nwsapi(max-file-lines)',
  )
  expect(
    violations.map(item => path.basename(item.filename, '.mts')).toSorted(),
  ).toEqual(
    cases
      .filter(item => item.expected)
      .map(item => item.name)
      .toSorted(),
  )
})
