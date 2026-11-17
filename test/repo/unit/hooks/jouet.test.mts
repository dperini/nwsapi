import { expect, test, vi } from 'vitest'
import path from 'node:path'
import { runJouetHook } from '../../../../scripts/repo/hooks/jouet.mts'

test('an unavailable Jouet install leaves the Claude hook inactive', () => {
  const run = vi.fn()
  expect(
    runJouetHook('session-start', {
      root: '/checkout',
      exists: () => false,
      run,
    }),
  ).toBe(0)
  expect(run).not.toHaveBeenCalled()
})

test('Claude hooks forward the event and child exit status', () => {
  const run = vi.fn(() => ({ status: 7 }))
  expect(
    runJouetHook('post-tool-use', {
      root: '/checkout',
      exists: () => true,
      run,
    }),
  ).toBe(7)
  expect(run).toHaveBeenCalledWith(
    '/checkout/.cache/bin/jouet',
    ['hook', 'claude', 'post-tool-use'],
    { stdio: 'inherit', shell: false },
  )
})

test('Windows Claude hooks use the setup command shim', () => {
  const run = vi.fn(() => ({ status: 0 }))
  runJouetHook('stop', {
    root: 'C:\\checkout',
    platform: 'win32',
    exists: () => true,
    run,
  })
  expect(run).toHaveBeenCalledWith(
    path.join('C:\\checkout', '.cache/bin/jouet.cmd'),
    ['hook', 'claude', 'stop'],
    { stdio: 'inherit', shell: true },
  )
})

test('Claude hook failures are returned or surfaced', () => {
  const failed = vi.fn(() => ({ status: null }))
  expect(
    runJouetHook('pre-tool-use', {
      exists: () => true,
      run: failed,
    }),
  ).toBe(1)

  const error = new Error('spawn failed')
  expect(() =>
    runJouetHook('stop', {
      exists: () => true,
      run: () => ({ status: null, error }),
    }),
  ).toThrow(error)
})
