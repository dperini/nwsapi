import { expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  runJourney,
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
    '<!-- onboarding:readiness:start -->\n```sh\nnode scripts/repo/develop/run.mts --task setup:check --json\n```\n<!-- onboarding:readiness:end -->',
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
