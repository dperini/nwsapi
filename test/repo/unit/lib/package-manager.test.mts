import { expect, test, vi, afterEach } from 'vitest'
import {
  invokingPackageManager,
  invokedByForeignPackageManager,
  foreignPackageManagerMessage,
} from '../../../../scripts/repo/lib/package-manager.mts'

afterEach(() => vi.unstubAllEnvs())
test.each(['npm', 'pnpm', 'aube', 'bun', 'vlt', 'yarn'])(
  'identifies the leading %s agent token',
  name => {
    const env = {
      npm_config_user_agent: ` ${name.toUpperCase()}/1.2.3 npm/12 node/26 `,
    }
    expect(invokingPackageManager(env)).toBe(name)
    expect(invokedByForeignPackageManager(env)).toBe(
      !['pnpm', 'aube'].includes(name),
    )
  },
)
test('absent and unknown callers have distinct compatibility states', () => {
  expect(invokingPackageManager({})).toBeUndefined()
  expect(
    invokingPackageManager({ npm_config_user_agent: '  ' }),
  ).toBeUndefined()
  expect(invokedByForeignPackageManager({})).toBe(false)
  expect(invokingPackageManager({ npm_config_user_agent: 'unknown/1' })).toBe(
    'other',
  )
  expect(
    invokedByForeignPackageManager({ npm_config_user_agent: 'unknown/1' }),
  ).toBe(true)
  vi.stubEnv('npm_config_user_agent', 'pnpm/12')
  expect(invokingPackageManager()).toBe('pnpm')
  expect(invokedByForeignPackageManager()).toBe(false)
})
test('manager guidance carries the requested command', () => {
  expect(foreignPackageManagerMessage('npm')).toContain('`pnpm`')
  expect(foreignPackageManagerMessage('npm', 'check')).toContain(
    '`pnpm run check`',
  )
})
