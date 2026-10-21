import { expect, test } from 'vitest'
import {
  bootstrapNodeIssue,
  nodeMeetsSecurityFloor,
  nodeSecurityMinimum,
} from '../../../../scripts/repo/setup/node-version.mts'

test.each([
  ['22.23.4', true],
  ['22.23.5', true],
  ['22.23.3', false],
  ['24.22.1', true],
  ['24.22.0', false],
  ['26.12.1', true],
  ['26.12.0', false],
  ['27.0.0', true],
  ['25.0.0', false],
])('Node %s security floor is accepted: %s', (version, expected) => {
  expect(nodeMeetsSecurityFloor(version)).toBe(expected)
})

test('reports the security release floor for each supported Node line', () => {
  expect(nodeSecurityMinimum('22.24.0')).toBe('22.23.4')
  expect(nodeSecurityMinimum('24.22.1')).toBe('24.22.1')
  expect(nodeSecurityMinimum('26.12.1')).toBe('26.12.1')
  expect(bootstrapNodeIssue('22.23.3')).toContain(
    '22.23.4, 24.22.1, or 26.12.1',
  )
  expect(bootstrapNodeIssue('26.12.1')).toBeUndefined()
})
