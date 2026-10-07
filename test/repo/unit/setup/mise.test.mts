import { expect, test, vi } from 'vitest'
import type { execFileSync } from 'node:child_process'
import {
  miseEnvironment,
  nubRequest,
  registerNub,
  MISE_ROOT,
} from '../../../../scripts/repo/setup/mise.mts'
import {
  toolExecutable,
  toolVersions,
  toolDirectory,
  toolPlan,
} from '../../../../scripts/repo/external-tools.mts'

test('mise uses checkout-local state and removes ambient tool overrides', () => {
  const env = miseEnvironment(
    {
      PATH: '/system',
      CUSTOM: 'keep',
      MISE_DATA_DIR: '/global',
      MISE_ENV: 'production',
      MISE_OFFLINE: '0',
      NODE_OPTIONS: '--inspect',
    },
    '/checkout/cache',
  )
  expect(env['CUSTOM']).toBe('keep')
  expect(env['PATH']).toBe('/system')
  expect(env['MISE_DATA_DIR']).toContain('checkout')
  expect('MISE_ENV' in env).toBe(false)
  expect('NODE_OPTIONS' in env).toBe(false)
  expect(env['MISE_GLOBAL_CONFIG_FILE']).toContain('empty.toml')
  expect(env['MISE_OFFLINE']).toBe('1')
})

test('mise registers the already verified nub archive without downloading it again', () => {
  const run = vi.fn<typeof execFileSync>()
  registerNub(run)
  expect(run).toHaveBeenCalledWith(
    toolExecutable('mise'),
    [
      'link',
      '--force',
      `github:nubjs/nub@${toolVersions()['nub']}`,
      toolDirectory(toolPlan('nub')),
    ],
    expect.objectContaining({ cwd: MISE_ROOT, stdio: 'inherit' }),
  )
})

test('mise selects the exact nub version and preserves all Node arguments', () => {
  const request = nubRequest([
    'node',
    'install',
    '26.11.0',
    'argument with spaces',
  ])
  expect(request.command).toBe(toolExecutable('mise'))
  expect(request.args).toEqual([
    'exec',
    `github:nubjs/nub@${toolVersions()['nub']}`,
    '--',
    'nub',
    'node',
    'install',
    '26.11.0',
    'argument with spaces',
  ])
})
