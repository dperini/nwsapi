import { expect, test } from 'vitest'
import {
  assertFinalized,
  checkNativeContract,
} from '../../../../../scripts/repo/check/wpt/native-contract.mts'
import { nativeRefreshArgs } from '../../../../../scripts/repo/update/native.mts'

test('finalization requires complete accounting and an explicit category for every native pass', () => {
  expect(() =>
    assertFinalized({ 'selector-matching': 2, 'other-api': 3 }, 5, 2),
  ).not.toThrow()
  expect(() =>
    assertFinalized({ 'selector-matching': 2, unresolved: 1 }, 3, 2),
  ).toThrow('not finalized')
  expect(() =>
    assertFinalized({ 'selector-matching': 2, unknown: 1 }, 3, 2),
  ).toThrow('not finalized')
  expect(() => assertFinalized({ 'selector-matching': 2 }, 3, 2)).toThrow(
    'exactly once',
  )
  expect(() => assertFinalized({ 'selector-matching': 2 }, 2, 1)).toThrow(
    'eligible category counts',
  )
})

test('updates reuse saved native reports only when both pins match and the report exists', () => {
  const pins = { browser: '154.0.8037.0', revision: 'a'.repeat(40) }
  const cached = { ...pins, directory: '/tmp/native-test' }
  expect(nativeRefreshArgs(pins, cached, () => true)).toEqual([
    '--resume',
    '--directory',
    '/tmp/native-test',
  ])
  expect(
    nativeRefreshArgs(pins, { ...cached, browser: '153.0.0.0' }, () => true),
  ).toEqual([])
  expect(
    nativeRefreshArgs(
      pins,
      { ...cached, revision: 'b'.repeat(40) },
      () => true,
    ),
  ).toEqual([])
  expect(nativeRefreshArgs(pins, cached, () => false)).toEqual([])
})

test('the committed native contract rejects a different browser or WPT pin', () => {
  expect(() =>
    checkNativeContract({ browser: '0.0.0.0', revision: '0'.repeat(40) }),
  ).toThrow('Native support pool is stale')
})
