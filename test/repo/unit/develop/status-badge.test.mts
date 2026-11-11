import { expect, test } from 'vitest'
import { statusBadgeLabel } from '../../../../scripts/repo/develop/status-badge.mts'

test('badges omit neutral and ready labels while retaining actionable states', () => {
  expect(
    statusBadgeLabel({ kind: 'info', label: 'Available', message: '' }),
  ).toBe('')
  expect(
    statusBadgeLabel({ kind: 'success', label: 'Ready', message: '' }),
  ).toBe('')
  expect(
    statusBadgeLabel({
      kind: 'warning',
      label: 'Needs attention',
      message: 'Missing tool',
    }),
  ).toBe('needs attention')
  expect(
    statusBadgeLabel({
      kind: 'error',
      label: 'Needs fixing',
      message: 'Failed',
    }),
  ).toBe('needs fixing')
  expect(
    statusBadgeLabel({
      kind: 'disabled',
      label: 'Disabled',
      message: 'macOS only',
    }),
  ).toBe('macos only')
})
