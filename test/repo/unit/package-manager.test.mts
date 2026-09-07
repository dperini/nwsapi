import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import {
  foreignPackageManagerMessage,
  invokedByForeignPackageManager,
  invokingPackageManager,
} from '../../../scripts/repo/lib/package-manager.mts'
import { REPO_ROOT } from '../../../scripts/repo/lib/paths.mts'

for (const agent of [undefined, 'pnpm/12.3.4', 'aube/1.0.0']) {
  test(`the launcher permits ${agent ?? 'direct Node invocation'}`, () => {
    const env: NodeJS.ProcessEnv = { __proto__: null, ...process.env }
    if (agent) {
      env.npm_config_user_agent = agent
    } else {
      delete env.npm_config_user_agent
    }
    const result = spawnSync(
      process.execPath,
      ['scripts/repo/run.mts', 'node_modules/typescript/bin/tsc', '--version'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env,
      },
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Version')
  })
}

for (const name of ['npm', 'yarn', 'bun', 'vlt', 'aube', 'pnpm'] as const) {
  test(`recognizes ${name} from the leading user-agent token`, () => {
    const env = {
      __proto__: null,
      npm_config_user_agent: `${name}/1.0.0 npm/? node/v26`,
    }
    expect(invokingPackageManager(env)).toBe(name)
    expect(invokedByForeignPackageManager(env)).toBe(
      !['aube', 'pnpm'].includes(name),
    )
  })
}

test('handles direct Node invocation, whitespace, casing, and unknown managers', () => {
  for (const agent of [undefined, '', '   ']) {
    expect(
      invokingPackageManager({ npm_config_user_agent: agent }),
    ).toBeUndefined()
    expect(
      invokedByForeignPackageManager({ npm_config_user_agent: agent }),
    ).toBe(false)
  }
  expect(
    invokingPackageManager({ npm_config_user_agent: ' PNPM/12.3.4 npm/? ' }),
  ).toBe('pnpm')
  expect(invokingPackageManager({ npm_config_user_agent: 'cnpm/9.0.0' })).toBe(
    'other',
  )
  expect(
    invokedByForeignPackageManager({ npm_config_user_agent: 'cnpm/9.0.0' }),
  ).toBe(true)
  expect(foreignPackageManagerMessage('npm', 'build')).toContain(
    'pnpm run build',
  )
})

for (const name of ['npm', 'yarn', 'bun', 'vlt', 'cnpm']) {
  test(`the launcher rejects ${name} before loading an entry`, () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/repo/run.mts', 'missing-entry.mts'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          __proto__: null,
          ...process.env,
          npm_config_user_agent: `${name}/1.0.0`,
          npm_lifecycle_event: 'build',
        },
      },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('pnpm run build')
    expect(result.stderr).not.toContain('ERR_MODULE_NOT_FOUND')
  })
}
