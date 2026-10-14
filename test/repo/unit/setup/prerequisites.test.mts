import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  checkPrerequisites,
  requiredCommands,
} from '../../../../scripts/setup/prerequisites.mts'

test('required commands follow selected archive formats', () => {
  assert.deepEqual(requiredCommands(['tool.tgz', 'other.tar.gz']), [
    'git',
    'tar',
  ])
  assert.deepEqual(requiredCommands(['tool.zip']), ['git', 'unzip'])
  assert.deepEqual(requiredCommands(['tool.zip'], 'win32'), [
    'git',
    'powershell',
  ])
  assert.deepEqual(requiredCommands(['tool.bin']), ['git'])
})

test('prerequisite checks name the missing command before setup proceeds', () => {
  const calls: string[] = []
  assert.throws(
    () =>
      checkPrerequisites(['git', 'tar'], command => {
        calls.push(command)
        return command === 'git'
          ? { status: 0 }
          : { status: null, error: new Error() }
      }),
    /Required command tar is unavailable.*node scripts\/setup\.mjs/,
  )
  assert.deepEqual(calls, ['git', 'tar'])
})

test('host prerequisite probes are injectable and run with bounded options', () => {
  const calls: { command: string; args: string[]; options: object }[] = []
  checkPrerequisites(['powershell'], (command, args, options) => {
    calls.push({ command, args, options })
    return { status: 0 }
  })
  assert.equal(calls[0].command, 'powershell')
  assert.deepEqual(calls[0].args.slice(0, 3), [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
  ])
  assert.equal(calls[0].options.timeout, 5000)
})
