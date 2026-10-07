import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import { nativeStatus } from '../../../../../../scripts/repo/check/wpt/native/status.mts'
import type * as NodeRunner from '../../../../../../scripts/repo/lib/run-node.mts'

const cli = vi.hoisted(() => ({ active: false }))
vi.mock(
  '../../../../../../scripts/repo/lib/run-node.mts',
  async importOriginal => ({
    ...(await importOriginal<typeof NodeRunner>()),
    isMainModule: (url: string) => cli.active && url.endsWith('/status.mts'),
  }),
)

test('status CLI requires an artifact directory and publishes parsed progress', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-status-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true }))
  writeFileSync(
    path.join(directory, 'plan.json'),
    JSON.stringify({ browser: '154', revision: 'pinned', tests: [] }),
  )
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const argv = process.argv
  cli.active = true
  try {
    process.argv = ['node', 'status.mts']
    vi.resetModules()
    await expect(
      import('../../../../../../scripts/repo/check/wpt/native/status.mts'),
    ).rejects.toThrow()
    process.argv = ['node', 'status.mts', '--directory', directory]
    vi.resetModules()
    await import('../../../../../../scripts/repo/check/wpt/native/status.mts')
    expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
      browser: '154',
      completed: 0,
      planned: 0,
      provisional: true,
    })
  } finally {
    process.argv = argv
    cli.active = false
  }
})

test('status includes resumed plans and does not treat the first completed run as final', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-status-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true }))
  const write = (file: string, value: unknown) =>
    writeFileSync(path.join(directory, file), JSON.stringify(value) + '\n')
  for (const suffix of ['', '-2']) {
    write(`plan${suffix}.json`, {
      browser: '154',
      revision: 'pinned',
      tests: [{ test: '/case' + suffix }],
    })
  }
  const events = (testPath: string) =>
    JSON.stringify({ action: 'test_end', test: testPath, status: 'OK' }) +
    '\n' +
    JSON.stringify({ action: 'suite_end' }) +
    '\n'
  writeFileSync(path.join(directory, 'events.jsonl'), events('/case'))
  writeFileSync(path.join(directory, 'events-2.jsonl'), '{"action":')
  expect(await nativeStatus(directory)).toMatchObject({
    planned: 2,
    completed: 1,
    finished: false,
  })
  writeFileSync(path.join(directory, 'events-2.jsonl'), events('/case-2'))
  expect(await nativeStatus(directory)).toMatchObject({
    planned: 2,
    completed: 2,
    finished: true,
    provisional: true,
  })
})

test('requires a plan and ignores unrelated plan names and unavailable events', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-status-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true }))
  writeFileSync(path.join(directory, 'planner.json'), '{}')
  await expect(nativeStatus(directory)).rejects.toThrow()
  writeFileSync(
    path.join(directory, 'plan.json'),
    JSON.stringify({ browser: '154', revision: 'pinned', tests: [] }),
  )
  expect(await nativeStatus(directory)).toMatchObject({
    planned: 0,
    completed: 0,
    finished: false,
    statuses: {},
    subtests: {},
  })
})

test('counts subtest outcomes while deduplicating completed tests by subsuite', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-native-status-'))
  t.onTestFinished(() => rmSync(directory, { recursive: true }))
  writeFileSync(
    path.join(directory, 'plan.json'),
    JSON.stringify({
      browser: '154',
      revision: 'pinned',
      tests: [{ test: '/case' }],
    }),
  )
  const events = [
    { action: 'test_status', status: 'PASS' },
    { action: 'test_status', status: 'PASS' },
    { action: 'test_status', status: 'FAIL' },
    {
      action: 'test_end',
      test: '/case',
      subsuite: 'experimental',
      status: 'OK',
    },
    {
      action: 'test_end',
      test: '/case',
      subsuite: 'experimental',
      status: 'OK',
    },
    { action: 'log', message: 'ignored' },
    { action: 'suite_end' },
  ]
  writeFileSync(
    path.join(directory, 'events.jsonl'),
    events.map(event => JSON.stringify(event)).join('\n'),
  )
  expect(await nativeStatus(directory)).toMatchObject({
    completed: 1,
    finished: true,
    statuses: { OK: 2 },
    subtests: { PASS: 2, FAIL: 1 },
  })
})
