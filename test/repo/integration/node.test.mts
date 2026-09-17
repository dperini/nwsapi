import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import {
  nodeInteropEnvironment,
  nodeInteropVersions,
  resolveNodeRuntime,
} from '../../../scripts/repo/node.mts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))
const execute = vi.mocked(execFileSync)
afterEach(() => execute.mockReset())

test('the matrix requires distinct exact pins and cannot silently skip every runtime', () => {
  for (const versions of [[], ['22'], ['latest'], ['22.23.2', '22.23.2']]) {
    expect(() => nodeInteropVersions(versions)).toThrow(
      'Node interoperability requires unique, exact versions.',
    )
  }
  expect(nodeInteropVersions(['22.23.2', '24.21.0'])).toEqual([
    '22.23.2',
    '24.21.0',
  ])
})

test('runtime selection ignores shell loaders without changing the parent environment', () => {
  const env = {
    NODE_EXECUTABLE: '/custom/node',
    NODE_OPTIONS: '--import custom-loader',
    NODE_PATH: '/custom/modules',
    NODE_EXTRA_CA_CERTS: '/custom/ca.pem',
  }
  expect(nodeInteropEnvironment(env)).toEqual({
    NODE_EXTRA_CA_CERTS: '/custom/ca.pem',
  })
  expect(env.NODE_EXECUTABLE).toBe('/custom/node')
})

test('nub resolves an isolated exact pin and the returned binary is verified', () => {
  let directory = ''
  execute.mockImplementationOnce((_command, _args, options) => {
    directory = String(options?.cwd)
    expect(readFileSync(path.join(directory, '.node-version'), 'utf8')).toBe(
      '22.23.2\n',
    )
    expect(
      JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')),
    ).toEqual({ private: true })
    return '/nub/node/22.23.2/bin/node\n'
  })
  execute.mockReturnValueOnce('v22.23.2\n')
  expect(resolveNodeRuntime('22.23.2')).toBe('/nub/node/22.23.2/bin/node')
  expect(execute.mock.calls[0]?.[1]).toEqual(['node', 'which'])
  expect(execute.mock.calls[1]?.slice(0, 2)).toEqual([
    '/nub/node/22.23.2/bin/node',
    ['--version'],
  ])
  expect(existsSync(directory)).toBe(false)
})

test('a wrong runtime fails instead of silently testing the host Node', () => {
  execute.mockReturnValueOnce('/custom/node\n')
  execute.mockReturnValueOnce('v24.21.0\n')
  expect(() => resolveNodeRuntime('22.23.2')).toThrow(
    'Expected Node 22.23.2, received v24.21.0',
  )
  expect(existsSync(String(execute.mock.calls[0]?.[2]?.cwd))).toBe(false)
})

test('failed provisioning propagates and removes the temporary project', () => {
  execute.mockImplementationOnce(() => {
    throw new Error('Node download failed')
  })
  expect(() => resolveNodeRuntime('22.23.2')).toThrow('Node download failed')
  expect(existsSync(String(execute.mock.calls[0]?.[2]?.cwd))).toBe(false)
})
