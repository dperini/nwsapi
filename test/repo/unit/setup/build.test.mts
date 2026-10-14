import { expect, test, vi } from 'vitest'
import path from 'node:path'
import type { existsSync } from 'node:fs'
import { buildReadiness } from '../../../../scripts/repo/setup/build.mts'
import { packageFiles } from '../../../../.config/build.config.mts'

test('build readiness checks the authoritative package outputs with native paths', () => {
  const exists = vi.fn<typeof existsSync>(() => true)
  expect(buildReadiness('/checkout', exists)).toEqual({
    ready: true,
    issues: [],
  })
  expect(exists.mock.calls.map(call => call[0])).toEqual(
    packageFiles.map(file => path.join('/checkout', file.output)),
  )
})
test('missing package outputs require repair', () => {
  const result = buildReadiness('/checkout', () => false)
  expect(result.ready).toBe(false)
  expect(result.issues).toHaveLength(packageFiles.length)
})
