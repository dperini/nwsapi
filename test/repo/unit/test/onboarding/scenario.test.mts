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
    {
      id: 'voiceover',
      execution: [
        'node',
        'scripts/repo/develop/run.mts',
        '--task',
        'voiceover',
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

test.each([true, false])(
  'setup recovery rebuilds deleted outputs with installed=%s',
  async installed => {
    const checkout = mkdtempSync(
      path.join(os.tmpdir(), 'nwsapi-journey-build-'),
    )
    const log = path.join(checkout, 'onboarding.log')
    const dist = path.join(checkout, 'dist')
    mkdirSync(path.join(checkout, '.config'), { recursive: true })
    mkdirSync(dist)
    if (installed) {
      mkdirSync(path.join(checkout, '.cache', 'bin'), { recursive: true })
      writeFileSync(path.join(checkout, '.cache', 'bin', 'pnpm'), '')
      writeFileSync(
        path.join(checkout, 'README.md'),
        '<!-- <onboarding> -->\n<!-- onboarding:bootstrap:start -->\n```sh\npnpm run setup\n```\n<!-- onboarding:bootstrap:end -->\n<!-- </onboarding> -->',
      )
    }
    writeFileSync(path.join(dist, 'index.js'), 'old build')
    writeFileSync(
      path.join(checkout, '.config/build.config.mts'),
      "export const packageFiles = [{ output: 'dist/index.js' }]\n",
    )
    const phases: string[] = []
    let readinessChecks = 0
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
        if (phase === 'literal README setup repair') {
          expect(installed).toBe(true)
          expect(args).toEqual(['run', 'setup'])
          expect(existsSync(dist)).toBe(false)
          mkdirSync(dist)
          writeFileSync(path.join(dist, 'index.js'), 'rebuilt')
          return { code: 0, stdout: '', stderr: '' }
        }
        const taskIndex = args.indexOf('--task')
        if (taskIndex >= 0) {
          const task = args[taskIndex + 1]!
          if (task === 'setup') {
            expect(existsSync(dist)).toBe(false)
            mkdirSync(dist)
            writeFileSync(path.join(dist, 'index.js'), 'rebuilt')
            mkdirSync(path.join(checkout, '.cache', 'bin'), {
              recursive: true,
            })
            writeFileSync(path.join(checkout, '.cache', 'bin', 'pnpm'), '')
          }
          if (task === 'setup:check') {
            readinessChecks += 1
            const status =
              !installed && readinessChecks === 1 ? 'failed' : 'completed'
            const exitCode = status === 'failed' ? 1 : 0
            return {
              code: exitCode,
              stdout: JSON.stringify({
                schemaVersion: 1,
                type: 'result',
                task,
                status,
                exitCode,
                signal: null,
                next: null,
              }),
              stderr: '',
            }
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
        installed,
      )
      expect(readFileSync(path.join(dist, 'index.js'), 'utf8')).toBe('rebuilt')
      expect(
        phases.filter(phase => phase === 'literal README setup repair'),
      ).toHaveLength(installed ? 1 : 0)
      expect(
        phases.filter(
          phase => phase === 'scripts/repo/develop/run.mts --task setup',
        ),
      ).toHaveLength(installed ? 0 : 1)
      expect(phases).toContain('package manifest and export check')
      expect(phases).toContain('built engine module load smoke check')
      expect(phases.some(phase => phase.includes('repeat setup'))).toBe(false)
      expect(phases.some(phase => phase.includes('bootstrap.mts'))).toBe(false)
    } finally {
      rmSync(checkout, { recursive: true, force: true })
    }
  },
)
