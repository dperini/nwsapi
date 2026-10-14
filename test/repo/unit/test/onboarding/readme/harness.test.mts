import { expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runReadmeHarnessSteps } from '../../../../../../scripts/repo/test/onboarding/readme/harness.mts'
import { managedPnpmLauncherPath } from '../../../../../../scripts/repo/test/onboarding/readme/commands.mts'
import type { CommandOutput } from '../../../../../../scripts/repo/test/onboarding/scenario.mts'

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
      if (phase === 'literal README readiness') {
        expect(_executable).toBe(managedPnpmLauncherPath(checkout))
        expect(args).toEqual([
          '--silent',
          'run',
          'dev',
          '--task',
          'setup:check',
          '--json',
        ])
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
    '<!-- <onboarding> -->\n<!-- onboarding:readiness:start -->\n```sh\npnpm --silent run dev --task setup:check --json\n```\n<!-- onboarding:readiness:end -->\n<!-- </onboarding> -->',
  )
  mkdirSync(path.join(checkout, '.cache', 'bin'), { recursive: true })
  writeFileSync(managedPnpmLauncherPath(checkout), '')
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

test('the quick-start setup command runs without requiring JSON output', async () => {
  const checkout = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-menu-'))
  try {
    mkdirSync(path.join(checkout, '.cache', 'bin'), { recursive: true })
    const launcher = managedPnpmLauncherPath(checkout)
    writeFileSync(launcher, '')
    writeFileSync(
      path.join(checkout, 'README.md'),
      '<!-- <onboarding> -->\n<!-- onboarding:pnpm-install:start -->\n```sh\npnpm i\npnpm run setup\n```\n<!-- onboarding:pnpm-install:end -->\n<!-- </onboarding> -->',
    )
    const run = vi.fn(async () => ({
      code: 0,
      stdout: 'Setup complete',
      stderr: '',
    }))
    await runReadmeHarnessSteps('log', checkout, process.execPath, {}, run)
    expect(run).toHaveBeenCalledOnce()
    expect(run.mock.calls[0]).toEqual([
      'log',
      'literal README pnpm-install-2',
      launcher,
      ['run', 'setup'],
      checkout,
      { PATH: path.join(checkout, '.cache', 'bin') },
      undefined,
      0,
    ])
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
})
