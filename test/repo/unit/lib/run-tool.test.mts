import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
const state = vi.hoisted(() => ({ agent: true, spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawnSync: state.spawn }))
vi.mock('../../../../scripts/repo/lib/is-agent.mts', () => ({
  isAgent: () => state.agent,
}))
import { runTool } from '../../../../scripts/repo/lib/run-tool.mts'
const originalExit = process.exitCode
beforeEach(() => {
  vi.clearAllMocks()
  state.agent = true
  state.spawn.mockReturnValue({ status: 0, stdout: '', stderr: '' })
})
afterEach(() => {
  process.exitCode = originalExit
})
test('agent tool runs capture output while preserving command working directory', () => {
  runTool(['fixture.mts'])
  expect(state.spawn).toHaveBeenCalledWith(
    process.execPath,
    ['fixture.mts'],
    expect.objectContaining({
      cwd: REPO_ROOT,
      stdio: ['inherit', 'pipe', 'pipe'],
    }),
  )
  expect(process.exitCode).toBe(0)
})
test('interactive and debug sessions retain streaming progress', () => {
  state.agent = false
  runTool(['fixture.mts'])
  expect(state.spawn.mock.calls[0]![2].stdio).toBe('inherit')
  state.agent = true
  runTool(['fixture.mts', '--debug'])
  expect(state.spawn.mock.calls[1]![2].stdio).toBe('inherit')
})
test('agent failures flush diagnostics and preserve unsuccessful exit status', () => {
  state.spawn.mockReturnValue({
    status: 7,
    stdout: 'fixture output',
    stderr: 'fixture diagnostic',
  })
  const output = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true)
  const errors = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation(() => true)
  runTool(['fixture.mts'])
  expect(output).toHaveBeenCalledWith('fixture output')
  expect(errors).toHaveBeenCalledWith('fixture diagnostic')
  expect(process.exitCode).toBe(7)
})
test('spawn errors propagate their code after diagnostics', () => {
  state.spawn.mockReturnValue({
    error: Object.assign(new Error('fixture'), { code: 'ERR_SPAWN_FIXTURE' }),
  })
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  expect(() => runTool(['fixture.mts'])).toThrow(
    expect.objectContaining({ code: 'ERR_SPAWN_FIXTURE' }),
  )
})
test('a signaled child yields unsuccessful exit status even without diagnostics', () => {
  state.spawn.mockReturnValue({ status: null })
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  runTool(['fixture.mts'])
  expect(process.exitCode).toBe(1)
})
