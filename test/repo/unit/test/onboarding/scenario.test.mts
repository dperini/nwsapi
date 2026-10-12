import { expect, test, vi } from 'vitest'
import {
  runJourney,
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

test('failed readiness harness captures safe doctor details before setup', async () => {
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
        return {
          code: 0,
          stdout: JSON.stringify(discovery),
          stderr: '',
        }
      }
      if (phase === 'setup diagnostics detail after readiness failure') {
        expect(args).toEqual(['scripts/repo/setup/doctor.mts', '--details'])
        return { code: 1, stdout: 'npm probe details', stderr: '' }
      }
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
    'setup diagnostics detail after readiness failure',
  ])
  expect(beforeSetup).toHaveBeenCalledOnce()
})
