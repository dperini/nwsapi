import { expect, test } from 'vitest'
import {
  lintConfigPath,
  OXLINT_CI_CONFIG,
  OXLINT_CONFIG,
} from '../../../../scripts/repo/lint/config.mts'

test('lint stays strict unless CI explicitly allows warnings', () => {
  expect(lintConfigPath({})).toBe(OXLINT_CONFIG)
  expect(lintConfigPath({ NWSAPI_LINT_ALLOW_WARNINGS: 'false' })).toBe(
    OXLINT_CONFIG,
  )
  expect(lintConfigPath({ NWSAPI_LINT_ALLOW_WARNINGS: 'true' })).toBe(
    OXLINT_CI_CONFIG,
  )
})
