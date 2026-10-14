import { expect, test, vi } from 'vitest'
import {
  requiredCommands,
  checkPrerequisites,
  resolvePowerShell,
} from '../../../../scripts/repo/setup/prerequisites.mts'
import type { PrerequisiteProbe } from '../../../../scripts/repo/setup/prerequisites.mts'

test('prerequisites match archive formats and native extraction commands', () => {
  expect(requiredCommands(['tool', 'npm.tgz'], 'linux')).toEqual(['git', 'tar'])
  expect(requiredCommands(['tool.zip', 'npm.tgz'], 'win32')).toEqual([
    'git',
    'tar',
    resolvePowerShell(),
  ])
  expect(
    requiredCommands(['tool.zip'], 'win32', { SystemRoot: 'C:\\Windows' }),
  ).toEqual([
    'git',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  ])
  expect(requiredCommands(['tool.zip'], 'darwin')).toEqual(['git', 'unzip'])
})

test('missing prerequisites report the exact executable and direct recovery', () => {
  const run = vi.fn<PrerequisiteProbe>(() => ({
    status: 1,
    signal: null,
    pid: 0,
    output: [],
    stdout: '',
    stderr: '',
  }))
  expect(() => checkPrerequisites(['tar'], run)).toThrow(
    'Required command tar failed with exit code 1',
  )
  expect(run).toHaveBeenCalledOnce()
})

test('working prerequisites use bounded PowerShell execution without a shell', () => {
  const run = vi.fn<PrerequisiteProbe>(() => ({
    status: 0,
    signal: null,
    pid: 0,
    output: [],
    stdout: '',
    stderr: '',
  }))
  const powerShell = resolvePowerShell({ SystemRoot: 'C:\\Windows' })
  checkPrerequisites(['git', 'unzip', powerShell], run)
  expect(run.mock.calls.map(call => call[0])).toEqual([
    'git',
    'unzip',
    powerShell,
  ])
  expect(run.mock.calls.every(call => !call[2]?.shell)).toBe(true)
  expect(run.mock.calls.at(-1)?.[2]?.timeout).toBe(30_000)
  expect(run.mock.calls.at(-1)?.[1]).toEqual([
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    '$PSVersionTable.PSVersion.ToString()',
  ])
})

test('PowerShell timeout reports a retry without suggesting installation', () => {
  const run = vi.fn<PrerequisiteProbe>(() => ({
    status: null,
    error: Object.assign(new Error('spawnSync timed out'), {
      code: 'ETIMEDOUT',
    }),
  }))
  expect(() => checkPrerequisites([resolvePowerShell()], run)).toThrow(
    'timed out after 30000ms. Retry node scripts/repo/setup/bootstrap.mts.',
  )
})

test('missing PowerShell reports installation guidance', () => {
  const run = vi.fn<PrerequisiteProbe>(() => ({
    status: null,
    error: Object.assign(new Error('spawnSync ENOENT'), { code: 'ENOENT' }),
  }))
  expect(() => checkPrerequisites([resolvePowerShell()], run)).toThrow(
    'is unavailable. Install it for this system',
  )
})

test('nonzero PowerShell status is reported as a command failure', () => {
  const run = vi.fn<PrerequisiteProbe>(() => ({ status: 1 }))
  expect(() => checkPrerequisites([resolvePowerShell()], run)).toThrow(
    'failed with exit code 1',
  )
})
