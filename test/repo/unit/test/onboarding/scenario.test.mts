import { expect, test, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  runJourney,
  runPlainSetupPreview,
  runReadmeHarnessSteps,
  type CommandOutput,
} from '../../../../../scripts/repo/test/onboarding/scenario.mts'

const discovery = {
  schemaVersion: 1,
  type: 'tasks',
  tasks: [
    {
      id: 'setup',
      execution: ['node', 'scripts/repo/develop/run.mts', '--task', 'setup'],
    },
    {
      id: 'guide',
      execution: ['node', 'scripts/repo/develop/run.mts', '--task', 'guide'],
    },
    {
      id: 'review',
      execution: ['node', 'scripts/repo/develop/run.mts', '--task', 'review'],
    },
    {
      id: 'ci:local',
      execution: ['node', 'scripts/repo/develop/run.mts', '--task', 'ci:local'],
    },
    {
      id: 'setup:check',
      execution: [
        'node',
        'scripts/repo/develop/run.mts',
        '--task',
        'setup:check',
      ],
    },
  ],
}

test('plain setup preview skips platforms without the verified Linux script PTY', async () => {
  const outcome = await runPlainSetupPreview(
    '/tmp/onboarding.log',
    '/tmp/checkout',
    '/tmp/node',
    {},
    value => value,
    'darwin',
  )

  expect(outcome).toMatchObject({
    status: 'skipped',
    code: null,
    command: expect.stringContaining('skipped on darwin'),
  })
})

test('expected pre-setup failure preserves its required exit code without extra probes', async () => {
  const phases: string[] = []
  const command = vi.fn(
    async (
      _file: string,
      phase: string,
      _executable: string,
      args: string[],
      _checkout: string,
      _env: NodeJS.ProcessEnv,
      _timeout?: number,
      expected?: number | null,
    ): Promise<CommandOutput> => {
      phases.push(phase)
      if (phase === 'harness task discovery') {
        return {
          code: 0,
          stdout: JSON.stringify(discovery),
          stderr: '',
        }
      }
      expect(args).toContain('setup:check')
      expect(expected).toBe(1)
      return {
        code: 1,
        stdout: JSON.stringify({
          schemaVersion: 1,
          type: 'result',
          task: 'setup:check',
          status: 'failed',
          exitCode: 1,
          signal: null,
          next: null,
        }),
        stderr: '',
      }
    },
  )
  const beforeSetup = vi.fn(async () => {
    throw new Error('stop after readiness diagnostics')
  })

  await expect(
    runJourney(
      '/tmp/onboarding.log',
      '/tmp/checkout',
      '/tmp/node',
      {},
      command,
      vi.fn(),
      value => value,
      vi.fn(),
      beforeSetup,
    ),
  ).rejects.toThrow('stop after readiness diagnostics')

  expect(phases).toEqual([
    'harness task discovery',
    'scripts/repo/develop/run.mts --task setup:check',
  ])
  expect(beforeSetup).toHaveBeenCalledOnce()
})

test('failed literal README readiness records doctor details before assertion', async () => {
  const checkout = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-readiness-'))
  const phases: string[] = []
  const command = vi.fn(
    async (
      _file: string,
      phase: string,
      _executable: string,
      args: string[],
    ): Promise<CommandOutput> => {
      phases.push(phase)
      if (phase === 'setup diagnostics detail after readiness failure') {
        expect(args).toEqual(['scripts/repo/setup/doctor.mts', '--details'])
        return { code: 1, stdout: 'managed npm diagnostic', stderr: '' }
      }
      return {
        code: 1,
        stdout: JSON.stringify({
          schemaVersion: 1,
          type: 'result',
          task: 'setup:check',
          status: 'failed',
          exitCode: 1,
        }),
        stderr: '',
      }
    },
  )
  writeFileSync(
    path.join(checkout, 'README.md'),
    '<!-- <onboarding> -->\n<!-- onboarding:readiness:start -->\n```sh\nnode scripts/repo/develop/run.mts --task setup:check --json\n```\n<!-- onboarding:readiness:end -->\n<!-- </onboarding> -->',
  )
  try {
    await expect(
      runReadmeHarnessSteps(
        '/tmp/onboarding.log',
        checkout,
        '/tmp/node',
        {},
        command,
      ),
    ).rejects.toThrow('Expected harness status completed; got failed.')
    expect(phases).toEqual([
      'literal README readiness',
      'setup diagnostics detail after readiness failure',
    ])
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
})

test('JSON setup rebuilds deleted outputs and avoids a third bootstrap after review', async () => {
  const checkout = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-journey-build-'))
  const log = path.join(checkout, 'onboarding.log')
  const dist = path.join(checkout, 'dist')
  mkdirSync(path.join(checkout, '.config'), { recursive: true })
  mkdirSync(dist)
  writeFileSync(path.join(dist, 'index.js'), 'old build')
  writeFileSync(
    path.join(checkout, '.config/build.config.mts'),
    "export const packageFiles = [{ output: 'dist/index.js' }]\n",
  )
  const phases: string[] = []
  const command = vi.fn(
    async (
      _file: string,
      phase: string,
      _executable: string,
      args: string[],
    ): Promise<CommandOutput> => {
      phases.push(phase)
      if (phase === 'harness task discovery') {
        return { code: 0, stdout: JSON.stringify(discovery), stderr: '' }
      }
      const taskIndex = args.indexOf('--task')
      if (taskIndex >= 0) {
        const task = args[taskIndex + 1]!
        if (task === 'setup') {
          expect(existsSync(dist)).toBe(false)
          mkdirSync(dist)
          writeFileSync(path.join(dist, 'index.js'), 'rebuilt')
        }
        return {
          code: 0,
          stdout: JSON.stringify({
            schemaVersion: 1,
            type: 'result',
            task,
            status: 'completed',
            exitCode: 0,
            signal: null,
            next: null,
          }),
          stderr: '',
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    },
  )
  try {
    await runJourney(
      log,
      checkout,
      '/tmp/node',
      {},
      command,
      async () => ({ command: 'node guide', code: 0 }),
      value => value,
      vi.fn(),
      async () => undefined,
      true,
    )
    expect(readFileSync(path.join(dist, 'index.js'), 'utf8')).toBe('rebuilt')
    expect(
      phases.filter(
        phase => phase === 'scripts/repo/develop/run.mts --task setup',
      ),
    ).toHaveLength(1)
    expect(phases).toContain('package manifest and export check')
    expect(phases).toContain('built engine module load smoke check')
    expect(phases.some(phase => phase.includes('repeat setup'))).toBe(false)
    expect(phases.some(phase => phase.includes('bootstrap.mts'))).toBe(false)
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
})
