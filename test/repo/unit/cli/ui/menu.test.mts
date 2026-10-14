import { expect, test, vi } from 'vitest'
import {
  executeInteractiveAction,
  runInteractiveCliWith,
} from '../../../../../scripts/repo/cli/ui/menu.mts'

vi.mock('@opentui/core', () => ({
  BoxRenderable: class {},
  SelectRenderable: class {},
  SelectRenderableEvents: {
    SELECTION_CHANGED: 'selection',
    ITEM_SELECTED: 'selected',
  },
  TextRenderable: class {},
  createCliRenderer: vi.fn(),
}))

test('interactive action runs once after the chooser has finished', async () => {
  const events: string[] = []
  const choose = vi.fn(async () => {
    events.push('chooser-cleaned-up')
    return 2
  })
  const execute = vi.fn(async () => {
    events.push('action')
    return 0
  })
  await expect(runInteractiveCliWith(choose, execute)).resolves.toBe(0)
  expect(events).toEqual(['chooser-cleaned-up', 'action'])
  expect(execute).toHaveBeenCalledTimes(1)
  expect(execute).toHaveBeenCalledWith(2)
})

test('cancel and chooser failure never execute an action', async () => {
  const execute = vi.fn(async () => 0)
  await expect(
    runInteractiveCliWith(async () => undefined, execute),
  ).resolves.toBe(0)
  await expect(
    runInteractiveCliWith(async () => {
      throw new Error('renderer unavailable')
    }, execute),
  ).resolves.toBe(78)
  expect(execute).not.toHaveBeenCalled()
})

test('selected jsdom actions dispatch their command args once', async () => {
  const run = vi.fn(async () => 'updated package metadata')
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(executeInteractiveAction(2, run)).resolves.toBe(0)
  await expect(executeInteractiveAction(3, run)).resolves.toBe(0)
  expect(run.mock.calls).toEqual([[['jsdom', 'add']], [['jsdom', 'remove']]])
  expect(log).toHaveBeenCalledTimes(2)
})

test('terminal cancellation propagates conventional signal exit statuses', async () => {
  const execute = vi.fn(async () => 0)
  await expect(
    runInteractiveCliWith(async () => 'SIGINT', execute),
  ).resolves.toBe(130)
  await expect(
    runInteractiveCliWith(async () => 'SIGTERM', execute),
  ).resolves.toBe(143)
  expect(execute).not.toHaveBeenCalled()
})

test('selected action errors do not become renderer fallback requests', async () => {
  const execute = vi.fn(async () => {
    throw new Error('action failed')
  })
  await expect(runInteractiveCliWith(async () => 0, execute)).rejects.toThrow(
    'action failed',
  )
})
