import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { isMainModule } from '../../../../scripts/lib/paths.mts'

test('main entry comparison supports native absolute and relative paths', () => {
  const entry = path.join(process.cwd(), 'scripts/setup.mjs')
  const url = pathToFileURL(entry).href
  assert.equal(isMainModule(url, entry), true)
  assert.equal(isMainModule(url, 'scripts/setup.mjs'), true)
  assert.equal(isMainModule(url, 'scripts/other.mjs'), false)
  assert.equal(isMainModule(url, ''), false)
})
