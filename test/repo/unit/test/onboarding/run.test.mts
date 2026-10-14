import path from 'node:path'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import {
  cleanEnvironment,
  assertUnchanged,
  immutableInputs,
  failureSummary,
  runEntry,
  readmeCommand,
  nextCommandArgs,
  verifyPrintedNext,
  blockedManagerCommand,
  verifyReadme,
  verifyTasks,
} from '../../../../../scripts/test/onboarding/run.mts'
import { toolVersion } from '../../../../../scripts/lib/external-tools.mjs'

test('onboarding isolation removes parent lifecycle, credential and Node injection settings', () => {
  const env = cleanEnvironment(
    {
      PATH: 'keep',
      npm_execpath: 'pnpm',
      NODE_OPTIONS: '--inspect',
      NPM_TOKEN: 'secret',
    },
    'home',
  )
  assert.equal(env.PATH, 'keep')
  assert.equal(env.npm_execpath, undefined)
  assert.equal(env.NODE_OPTIONS, undefined)
  assert.equal(env.NPM_TOKEN, undefined)
  assert.equal(env.HOME, 'home')
})

test('onboarding reports changed pins and useful TAP failures', () => {
  assert.doesNotThrow(() => assertUnchanged({ lock: 'a' }, { lock: 'a' }))
  assert.throws(() => assertUnchanged({ lock: 'a' }, { lock: 'b' }), /lock/)
  assert.equal(
    failureSummary('ok 1 - passing\nnot ok 2 - packaging failed\nmore'),
    'not ok 2 - packaging failed',
  )
})

test('onboarding snapshots root npm configuration as an install input', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'nwsapi-onboarding-inputs-'))
  try {
    const before = immutableInputs(root)
    writeFileSync(path.join(root, '.npmrc'), 'legacy-peer-deps=true\n')
    const after = immutableInputs(root)
    assert.throws(() => assertUnchanged(before, after), /\.npmrc/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('Windows PATH casing keeps external prerequisites without duplicate environment entries', () => {
  const env = cleanEnvironment(
    { Path: 'windows tools', LOCALAPPDATA: 'external' },
    'home',
  )
  assert.equal(env.PATH, 'windows tools')
  assert.equal(env.Path, undefined)
  assert.equal(env.LOCALAPPDATA, 'home/AppData/Local'.split('/').join(path.sep))
})

test('npm entry installs through its declared CLI with a mocked installer', async () => {
  const calls: string[][] = []
  await runEntry(
    'journey',
    [{ id: 'install', command: ['npm', 'i'] }],
    async (_label, command, args) => {
      calls.push([command, ...args])
      return args.includes('--version') ? toolVersion('npm') : ''
    },
    async () => 'entry-cli.js',
  )
  assert.deepEqual(calls, [
    [process.execPath, 'entry-cli.js', '--version'],
    [process.execPath, 'entry-cli.js', 'i'],
  ])
  await assert.rejects(
    runEntry(
      'journey',
      [],
      async () => 'wrong',
      async () => 'mock',
    ),
    /Entry npm/,
  )
})

test('README and harness verification reject invalid commands and failed tasks', async () => {
  assert.throws(() => readmeCommand([], 'install', 'npm'), /Missing or invalid/)
  assert.throws(
    () =>
      readmeCommand(
        [{ id: 'install', command: ['pnpm', 'i'] }],
        'install',
        'npm',
      ),
    /Missing or invalid/,
  )
  await assert.rejects(
    verifyReadme(
      [{ id: 'discovery', command: ['node', 'run'] }],
      'node',
      async () => '{"type":"wrong"}',
    ),
    /Unexpected/,
  )
  await assert.rejects(
    verifyTasks('node', 'runner', async () => '{"status":"failed"}'),
    /Guided task failed/,
  )
})

test('printed setup and doctor next commands run through direct Node', async () => {
  const calls: string[][] = []
  const phase = async (_label: string, command: string, args: string[]) => {
    calls.push([command, ...args])
    return ''
  }
  const setup = '[setup] Core checkout ready with pinned npm 12.2.0. Next: node scripts/develop/run.mts'
  const doctor = 'Next command: node scripts/develop/run.mts'
  assert.deepEqual(nextCommandArgs(setup, 'Next: '), [
    'scripts/develop/run.mts',
  ])
  await verifyPrintedNext(setup, 'Next: ', 'pinned-node', phase)
  await verifyPrintedNext(doctor, 'Next command: ', 'pinned-node', phase)
  assert.deepEqual(calls, [
    ['pinned-node', 'scripts/develop/run.mts'],
    ['pinned-node', 'scripts/develop/run.mts'],
  ])
  assert.throws(
    () => nextCommandArgs('Next command: npm run dev', 'Next command: '),
    /direct Node/,
  )
})

test('external npm probes resolve through PATH after bootstrap', () => {
  const probe = blockedManagerCommand({ ComSpec: 'cmd.exe' })
  if (process.platform === 'win32') {
    assert.deepEqual(probe, {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm --version'],
    })
  } else {
    assert.deepEqual(probe, { command: 'npm', args: ['--version'] })
  }
})
