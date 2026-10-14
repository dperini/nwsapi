import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { testFiles } from '../../../../scripts/test/run.mts'

test('test discovery includes nested authored suites and excludes fixture files', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-test-discovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, 'test/repo/unit/lib')
  mkdirSync(directory, { recursive: true })
  const selected = path.join(directory, 'paths.test.mts')
  writeFileSync(selected, '')
  writeFileSync(path.join(directory, 'fixture.mjs'), '')
  assert.deepEqual(testFiles(root), [selected])
})
