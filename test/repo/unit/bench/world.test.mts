import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'vitest'
import { REPO_ROOT } from '../../../../scripts/repo/lib/paths.mts'
import { loadEngine, world } from '../../../../scripts/repo/bench/world.mts'

test('benchmark worlds isolate document engines and invalidate live caches without changing nodes', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-world-'))
  const baseline = path.join(directory, 'engine.cjs')
  writeFileSync(
    baseline,
    'let count = 0; module.exports = options => ({ options, count: ++count })',
  )
  const first = world('<main><i></i><i></i></main>', { baseline })
  const second = world('<b></b>')
  try {
    assert.equal(first.engines.baseline.count, 1)
    assert.equal(second.engines.baseline, null)
    assert.notEqual(first.engines.nwsapi, second.engines.nwsapi)
    assert.equal(first.elements, 6)
    assert.equal(first.all().length, first.elements)
    assert.equal(first.all('i').length, 2)
    const before = first.document.body.innerHTML
    first.touch()
    assert.equal(first.document.body.innerHTML, before)
    const repeated = loadEngine(path.relative(REPO_ROOT, baseline), {
      document: first.document,
      DOMException: first.window.DOMException,
    })
    assert.equal(repeated.count, 1)
    assert.equal(repeated.options.document, first.document)
  } finally {
    first.window.close()
    second.window.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
