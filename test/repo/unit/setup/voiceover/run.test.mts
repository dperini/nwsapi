import { PassThrough } from 'node:stream'
import type * as ChildProcess from 'node:child_process'
import { afterEach, expect, test, vi } from 'vitest'
import { setupVoiceOver } from '../../../../../scripts/repo/setup/voiceover/run.mts'
import type { VoiceOverPreflight } from '../../../../../scripts/repo/setup/voiceover/preflight.mts'
import type { VoiceOverRun } from '../../../../../scripts/repo/setup/voiceover/run.mts'

const hostCommand = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error(
      'Inject a setup mock. Unit tests cannot launch host commands.',
    )
  }),
)
vi.mock('node:child_process', async original => ({
  ...(await original<typeof ChildProcess>()),
  exec: hostCommand,
  execFile: hostCommand,
  execFileSync: hostCommand,
  execSync: hostCommand,
  fork: hostCommand,
  spawn: hostCommand,
  spawnSync: hostCommand,
}))
afterEach(() => {
  expect(hostCommand).not.toHaveBeenCalled()
})

function state(
  machineSetup: VoiceOverPreflight['machineSetup'],
  assets: VoiceOverPreflight['assets'],
  platform: NodeJS.Platform = 'darwin',
): VoiceOverPreflight {
  return {
    platform,
    supported: platform === 'darwin',
    machineSetup,
    assets,
    permissions: 'unverified',
    localPreferences: 'present',
  }
}

function streams(answer = '') {
  const input = new PassThrough() as unknown as NodeJS.ReadStream & {
    isTTY: boolean
  }
  input.isTTY = true
  const output = new PassThrough() as unknown as NodeJS.WriteStream & {
    isTTY: boolean
  }
  output.isTTY = true
  setImmediate(() => input.end(answer))
  return { input, output }
}

test('noninteractive default skips without running machine setup', async () => {
  const run = vi.fn<VoiceOverRun>(() => ({ status: 0, signal: null }))
  const result = await setupVoiceOver({
    probe: () => state('needed', 'missing'),
    run,
    tty: false,
  })
  expect(result.status).toBe(0)
  expect(run).not.toHaveBeenCalled()
})

test('default prompt treats blank and no as skip', async () => {
  for (const answer of ['\n', 'n\n']) {
    const { input, output } = streams(answer)
    const run = vi.fn<VoiceOverRun>(() => ({ status: 0, signal: null }))
    const result = await setupVoiceOver({
      probe: () => state('needed', 'missing'),
      run,
      input,
      output,
      ask: async () => answer,
      tty: true,
      log: vi.fn(),
    })
    expect(result.status).toBe(0)
    expect(run).not.toHaveBeenCalled()
  }
})

test('explicit opt-in installs assets then runs the narrow machine setup command', async () => {
  const run = vi.fn<VoiceOverRun>(() => ({ status: 0, signal: null }))
  const result = await setupVoiceOver({
    root: '/fixture',
    choice: 'yes',
    probe: vi
      .fn()
      .mockReturnValueOnce(state('needed', 'missing'))
      .mockReturnValueOnce(state('needed', 'missing'))
      .mockReturnValue(state('ready', 'present')),
    run,
    log: vi.fn(),
  })
  expect(result.status).toBe(0)
  expect(run.mock.calls.map(call => call[0])).toEqual([
    ['exec', 'guidepup', 'install', 'voiceover'],
    ['exec', 'guidepup', 'setup', '--macos-ignore-tcc-db'],
  ])
  expect(run.mock.calls[0]?.[1]).toBe('/fixture/.cache/guidepup')
})

test('already configured state does not repeat setup or prompt', async () => {
  const run = vi.fn<VoiceOverRun>(() => ({ status: 0, signal: null }))
  const result = await setupVoiceOver({
    probe: () => state('ready', 'present'),
    run,
    tty: true,
  })
  expect(result.status).toBe(0)
  expect(run).not.toHaveBeenCalled()
})

test('unknown machine settings allow asset install but never machine mutation', async () => {
  const run = vi.fn<VoiceOverRun>(() => ({ status: 0, signal: null }))
  const result = await setupVoiceOver({
    choice: 'yes',
    probe: () => state('unknown', 'missing'),
    run,
    log: vi.fn(),
  })
  expect(result.status).toBe(1)
  expect(run.mock.calls.map(call => call[0])).toEqual([
    ['exec', 'guidepup', 'install', 'voiceover'],
  ])
})

test('asset failure stops before machine setup and reports retry path', async () => {
  const log = vi.fn()
  const run = vi.fn<VoiceOverRun>(() => ({ status: 7, signal: null }))
  const result = await setupVoiceOver({
    choice: 'yes',
    probe: () => state('needed', 'missing'),
    run,
    log,
  })
  expect(result.status).toBe(7)
  expect(run).toHaveBeenCalledTimes(1)
  expect(log.mock.calls.flat().join('\n')).toContain('--voiceover')
})

test('unsupported OS silently skips but explicit opt-in reports unsupported', async () => {
  const run = vi.fn<VoiceOverRun>(() => ({ status: 0, signal: null }))
  const probe = () => state('unsupported', 'unsupported', 'linux')
  expect((await setupVoiceOver({ probe, run })).status).toBe(0)
  expect((await setupVoiceOver({ choice: 'yes', probe, run })).status).toBe(1)
  expect(run).not.toHaveBeenCalled()
})

test('failed setup offers only the allowlisted macOS settings panel after opt-in', async () => {
  const { input, output } = streams('y\n')
  const openSettings = vi.fn(() => ({ status: 0, signal: null }))
  const run = vi
    .fn()
    .mockReturnValueOnce({ status: 0, signal: null })
    .mockReturnValueOnce({ status: 1, signal: null })
  await setupVoiceOver({
    choice: 'yes',
    probe: () => state('needed', 'missing'),
    run,
    input,
    output,
    ask: async () => 'y',
    tty: true,
    openSettings,
    log: vi.fn(),
  })
  expect(openSettings).toHaveBeenCalledWith(
    '/System/Applications/Utilities/VoiceOver Utility.app',
  )
})

test('explicit skip avoids probes, prompts, and commands', async () => {
  const probe = vi.fn(() => state('needed', 'missing'))
  const run = vi.fn<VoiceOverRun>(() => ({ status: 0, signal: null }))
  const ask = vi.fn(async () => 'y')
  const result = await setupVoiceOver({ choice: 'no', probe, run, ask })
  expect(result.status).toBe(0)
  expect(probe).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
  expect(ask).not.toHaveBeenCalled()
})

test.each(['y', 'n'])(
  'unknown settings offer a permission window with separate consent: %s',
  async answer => {
    const openSettings = vi.fn(() => ({ status: 0, signal: null }))
    const run = vi.fn<VoiceOverRun>(() => ({ status: 0, signal: null }))
    const result = await setupVoiceOver({
      choice: 'yes',
      probe: () => state('unknown', 'missing'),
      run,
      log: vi.fn(),
      tty: true,
      ask: async () => answer,
      openSettings,
    })
    expect(result.status).toBe(1)
    expect(run).toHaveBeenCalledTimes(1)
    if (answer === 'y') {
      expect(openSettings).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security',
      )
    } else {
      expect(openSettings).not.toHaveBeenCalled()
    }
  },
)

test('missing local preferences prevent Guidepup machine configuration', async () => {
  const run = vi.fn<VoiceOverRun>(() => ({ status: 0, signal: null }))
  const result = await setupVoiceOver({
    choice: 'yes',
    probe: () => ({
      ...state('needed', 'missing'),
      localPreferences: 'missing',
    }),
    run,
    log: vi.fn(),
  })
  expect(result.status).toBe(1)
  expect(run.mock.calls.map(call => call[0])).toEqual([
    ['exec', 'guidepup', 'install', 'voiceover'],
  ])
})

test('readline EOF skips without waiting or running commands', async () => {
  const input = new PassThrough() as unknown as NodeJS.ReadStream & {
    isTTY: boolean
  }
  input.isTTY = true
  const output = new PassThrough() as unknown as NodeJS.WriteStream & {
    isTTY: boolean
  }
  output.isTTY = true
  setImmediate(() => input.end())
  const run = vi.fn<VoiceOverRun>(() => ({ status: 0, signal: null }))
  const result = await setupVoiceOver({
    probe: () => state('needed', 'missing'),
    run,
    input,
    output,
    tty: true,
  })
  expect(result.status).toBe(0)
  expect(run).not.toHaveBeenCalled()
})
