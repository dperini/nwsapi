import { expect, test, vi } from 'vitest'
import { parseProfileArgs } from '../../../../../scripts/repo/bench/profile/options.mts'

test('profile options support named and positional forms', () => {
  const fallback = vi.fn(() => '/tmp/default.cpuprofile')
  expect(parseProfileArgs([], fallback)).toMatchObject({ phase: 'select' })
  expect(fallback).toHaveBeenCalledOnce()
  expect(
    parseProfileArgs(
      ['--phase', 'first', '--output', '/tmp/first.cpuprofile'],
      fallback,
    ),
  ).toEqual({ phase: 'first', output: '/tmp/first.cpuprofile' })
  expect(
    parseProfileArgs(['resolver', '/tmp/resolver.cpuprofile'], fallback),
  ).toEqual({ phase: 'resolver', output: '/tmp/resolver.cpuprofile' })
})

test.each([
  ['--phase', 'unknown'],
  ['select', '/tmp/a.cpuprofile', 'extra'],
  ['select', '--phase', 'first'],
  ['select', '/tmp/a.cpuprofile', '--output', '/tmp/b.cpuprofile'],
  ['--output', ''],
  ['--unknown'],
])('profile options reject ambiguous input %#', (...args) => {
  expect(() =>
    parseProfileArgs(args, () => '/tmp/default.cpuprofile'),
  ).toThrow()
})
