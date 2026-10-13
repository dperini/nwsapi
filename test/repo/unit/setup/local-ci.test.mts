import { expect, test } from 'vitest'
import { localCiStatus } from '../../../../scripts/repo/setup/local-ci.mts'
import type { CheckoutReadiness } from '../../../../scripts/repo/setup/readiness.mts'

const ready: CheckoutReadiness = {
  tools: { ready: true, detail: 'ready' },
  dependencies: { ready: true, issues: [] },
  build: { ready: true, issues: [] },
}

test('requires a working Docker socket for local Actions runs', () => {
  expect(localCiStatus(ready, true)).toEqual({ ready: true, message: '' })
  expect(localCiStatus(ready, false)).toEqual({
    ready: false,
    message:
      'A working Docker socket is required. Start Docker Desktop with the default socket enabled, or set LOCAL_CI_DOCKER_HOST.',
  })
})

test('reports setup requirements before checking Docker availability', () => {
  const unready = {
    ...ready,
    tools: { ready: false, detail: 'Run setup.' },
    dependencies: { ready: false, issues: ['Dependencies are missing.'] },
  }
  expect(localCiStatus(unready, false)).toMatchObject({
    ready: false,
    message: expect.stringContaining(
      'Run node scripts/repo/setup/bootstrap.mts',
    ),
  })
})
