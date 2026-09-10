import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { nativeStatus } from '../../../../../scripts/repo/check/wpt/native-status.mts'

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
