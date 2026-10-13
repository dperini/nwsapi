import { expect, test } from 'vitest'
import { localCiStatus } from '../../../../scripts/repo/setup/local-ci.mts'
import type { CheckoutReadiness } from '../../../../scripts/repo/setup/readiness.mts'

const ready: CheckoutReadiness = {
  tools: { ready: true, detail: 'ready' },
  dependencies: { ready: true, issues: [] },
  build: { ready: true, issues: [] },
}

test('recommends OrbStack on macOS when the Docker socket is missing', () => {
  expect(localCiStatus(ready, true)).toEqual({ ready: true, message: '' })
  expect(localCiStatus(ready, false, 'darwin')).toEqual({
    ready: false,
    message: expect.stringContaining(
      'OrbStack is the recommended macOS runtime.',
    ),
  })
  expect(localCiStatus(ready, false, 'linux')).toMatchObject({
    message: expect.stringContaining('Start Docker Engine or Docker Desktop'),
  })
  expect(localCiStatus(ready, false, 'win32')).toMatchObject({
    message: expect.stringContaining('Start Docker Desktop'),
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
