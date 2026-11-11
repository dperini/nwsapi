import { expect, test, vi } from 'vitest'
const run = vi.hoisted(() => vi.fn())
vi.mock('../../../../scripts/repo/lib/run-node.mts', () => ({
  isMainModule: () => false,
  runNode: run,
}))
import { main } from '../../../../scripts/repo/develop/guide.mts'
import { formatCommandHelp } from '../../../../scripts/repo/develop/help.mts'

test('guide help uses project commands without starting Vite', () => {
  run.mockClear()
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  main(['--help'])
  expect(run).not.toHaveBeenCalled()
  expect(log).toHaveBeenCalledWith(formatCommandHelp('guide'))
})

test('guide forwards server options with the project configuration', () => {
  run.mockClear()
  main(['--port', '4321', '--host', '127.0.0.1'])
  expect(run).toHaveBeenCalledWith(
    expect.stringMatching(/vite\/bin\/vite\.js$/),
    [
      '--config',
      '.config/model-guide.mts',
      '--port',
      '4321',
      '--host',
      '127.0.0.1',
    ],
  )
})
