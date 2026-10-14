import { expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

test('README setup repair dispatches the marked package script through managed pnpm', () => {
  const checkout = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-harness-repair-'))
  const bin = path.join(checkout, '.cache', 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(path.join(bin, 'pnpm'), '')
  try {
    const resolved = resolveReadmeBootstrapRepairCommand(
      { id: 'bootstrap', command: ['pnpm', 'run', 'setup'] },
      checkout,
      { PATH: '/staged/bin' },
      'linux',
    )
    expect(resolved).toEqual({
      executable: path.join(bin, 'pnpm'),
      args: ['run', 'setup'],
      env: { PATH: `${bin}${path.delimiter}/staged/bin` },
    })
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
})

test('README repair marker must keep setup as a recovery script', () => {
  expect(() =>
    resolveReadmeBootstrapRepairCommand(
      {
        id: 'bootstrap',
        command: ['node', 'scripts/repo/setup/bootstrap.mts'],
      },
      '/tmp/checkout',
      {},
    ),
  ).toThrow('must use the pinned pnpm setup script')
})
