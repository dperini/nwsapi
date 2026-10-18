import { expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import manifest from '../../../../../../package.json' with { type: 'json' }
import {
  resolveReadmeBootstrapRepairCommand,
  resolveReadmeHarnessCommand,
} from '../../../../../../scripts/repo/test/onboarding/readme/commands.mts'

test.each([
  ['linux', 'pnpm'],
  ['win32', 'pnpm.cmd'],
] as const)(
  'README harness uses the managed pnpm launcher on %s',
  (platform, name) => {
    const checkout = mkdtempSync(
      path.join(os.tmpdir(), 'nwsapi-harness-command-'),
    )
    const bin = path.join(checkout, '.cache', 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(path.join(bin, name), '')
    try {
      const resolved = resolveReadmeHarnessCommand(
        {
          id: 'task-discovery',
          command: ['pnpm', '--silent', 'run', 'dev', '--list', '--json'],
        },
        checkout,
        { PATH: '/staged/bin' },
        platform,
      )
      expect(resolved).toEqual({
        executable: path.join(bin, name),
        args: ['--silent', 'run', 'dev', '--list', '--json'],
        env: { PATH: `${bin}${path.delimiter}/staged/bin` },
      })
    } finally {
      rmSync(checkout, { recursive: true, force: true })
    }
  },
)

test('README harness rejects a command that does not match its marker', () => {
  expect(() =>
    resolveReadmeHarnessCommand(
      {
        id: 'task-discovery',
        command: ['node', 'scripts/repo/develop/run.mts', '--list', '--json'],
      },
      '/tmp/checkout',
      {},
    ),
  ).toThrow('must use its pinned pnpm task command')
})

test('README setup repair runs pnpm go through the managed launcher', () => {
  const checkout = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-harness-repair-'))
  const bin = path.join(checkout, '.cache', 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(path.join(bin, 'pnpm'), '')
  try {
    const resolved = resolveReadmeBootstrapRepairCommand(
      { id: 'bootstrap', command: ['pnpm', 'go'] },
      checkout,
      { PATH: '/staged/bin' },
      'linux',
    )
    expect(resolved).toEqual({
      executable: path.join(bin, 'pnpm'),
      args: ['go'],
      env: { PATH: `${bin}${path.delimiter}/staged/bin` },
    })
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
})

test('README repair marker must keep pnpm go as the recovery command', () => {
  expect(() =>
    resolveReadmeBootstrapRepairCommand(
      {
        id: 'bootstrap',
        command: ['node', 'scripts/repo/setup/bootstrap.mts'],
      },
      '/tmp/checkout',
      {},
    ),
  ).toThrow('must use pnpm go')
})

test('the bootstrap command leaves pnpm setup available for its shell setup', () => {
  expect(manifest.scripts).not.toHaveProperty('setup')
  expect(manifest.scripts['go']).toBe('node scripts/repo/setup/bootstrap.mts')
})
