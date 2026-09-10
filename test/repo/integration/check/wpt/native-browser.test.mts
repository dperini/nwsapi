import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { nativeBrowserLauncher } from '../../../../../scripts/repo/check/wpt/native-browser.mts'

test('native launcher preserves inherited debugging descriptors and filters feature flags', () => {
  const launcher = nativeBrowserLauncher('/bin/bash')
  const result = spawnSync(
    '/bin/bash',
    [
      '-c',
      launcher,
      'launcher',
      '--enable-features=A,B',
      '-c',
      'printf pipe-preserved >&3',
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  )
  expect(result.status).toBe(0)
  expect(result.output[3]).toBe('pipe-preserved')
})
