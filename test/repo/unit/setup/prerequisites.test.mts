import { expect, test, vi } from 'vitest'
import {
  requiredCommands,
  checkPrerequisites,
} from '../../../../scripts/repo/setup/prerequisites.mts'
import type { PrerequisiteProbe } from '../../../../scripts/repo/setup/prerequisites.mts'

test('prerequisites match archive formats and native extraction commands', () => {
  expect(requiredCommands(['tool', 'npm.tgz'], 'linux')).toEqual(['git', 'tar'])
  expect(requiredCommands(['tool.zip', 'npm.tgz'], 'win32')).toEqual([
    'git',
    'tar',
    'powershell',
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
    'Required command tar is unavailable',
  )
  expect(run).toHaveBeenCalledOnce()
})

test('working prerequisites are checked without running a shell', () => {
  const run = vi.fn<PrerequisiteProbe>(() => ({
    status: 0,
    signal: null,
    pid: 0,
    output: [],
    stdout: '',
    stderr: '',
  }))
  checkPrerequisites(['git', 'unzip', 'powershell'], run)
  expect(run.mock.calls.map(call => call[0])).toEqual([
    'git',
    'unzip',
    'powershell',
  ])
  expect(run.mock.calls.every(call => !call[2]?.shell)).toBe(true)
})
