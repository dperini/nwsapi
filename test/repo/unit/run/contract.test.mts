import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
import { discoverScriptEntrypoints } from '../../../../scripts/repo/script-entrypoints/check.mts'
import {
  commandResult,
  describeScript,
  DRY_RUN_ENTRIES,
  formatScriptDescription,
  parseCommandJson,
} from '../../../../scripts/repo/run/contract.mts'

const { entrypoints, errors } = discoverScriptEntrypoints()

test('the script inventory resolves every package target', () => {
  expect(errors).toEqual([])
  expect(entrypoints.length).toBeGreaterThan(0)
})

test.each(entrypoints.map(entrypoint => [entrypoint.file]))(
  '%s describes its supported script interface',
  entry => {
    const description = describeScript(entry as string)
    expect(description).toMatchObject({
      schemaVersion: 1,
      type: 'command',
      entry,
    })
    expect(description.options).toEqual(
      expect.arrayContaining(['--json', '--describe']),
    )
    expect(description.options.includes('--dry-run')).toBe(
      DRY_RUN_ENTRIES.has(entry as string),
    )
    expect(formatScriptDescription(description)).toContain(entry as string)
  },
)

test.each([
  ['{"ready":true}', { ready: true }],
  ['plain output\n', 'plain output'],
  ['', null],
])('JSON output normalizes %j', (output, expected) => {
  expect(parseCommandJson(output as string)).toEqual(expected)
})

test('command results preserve command identity, output, and process status', () => {
  expect(
    commandResult('scripts/repo/check/run.mts', ['--all'], {
      status: 1,
      signal: null,
      stdout: '{"failed":["lint"]}',
      stderr: 'lint failed\n',
    }),
  ).toEqual({
    schemaVersion: 1,
    type: 'result',
    command: {
      entry: 'scripts/repo/check/run.mts',
      args: ['--all'],
    },
    exitCode: 1,
    signal: null,
    output: { failed: ['lint'] },
    stderr: 'lint failed',
  })
})

test('runner emits JSON for a script that only prints human or native output', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/repo/run.mts', 'scripts/repo/external-tools.mts', '--json'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({
    schemaVersion: 1,
    type: 'result',
    command: { entry: 'scripts/repo/external-tools.mts', args: [] },
    exitCode: 0,
    output: expect.objectContaining({ node: expect.any(String) }),
  })
})
