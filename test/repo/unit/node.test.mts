import { expect, test, vi } from 'vitest'
import {
  main,
  nodeInteropVersions,
  nodeSetupPlan,
} from '../../../scripts/repo/node.mts'

test('Node interoperability plans exact version installs under the managed runtime root', () => {
  expect(nodeInteropVersions(['26.12.1'])).toEqual(['26.12.1'])
  expect(() => nodeInteropVersions(['26.11'])).toThrow('unique, exact versions')
  expect(nodeSetupPlan(['26.12.1'])).toMatchObject({
    type: 'preview',
    command: 'setup/node',
    versions: ['26.12.1'],
    targets: [expect.stringContaining('26.12.1')],
  })
})

test('Node setup dry run does not install runtimes', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  main(['--dry-run', '--json'])
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({
    type: 'preview',
    command: 'setup/node',
  })
})
