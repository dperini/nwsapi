import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import type { NwsapiEngine } from '../../../../.config/runtime.d.ts'

const require = createRequire(import.meta.url)
const [baseline, candidate, output] = process.argv.slice(2)
if (baseline === '--worker') {
  assert.ok(global.gc)
  const factory = require(path.resolve(candidate!)) as (
    host: unknown,
  ) => NwsapiEngine
  const { window } = new JSDOM('<!doctype html><body></body>')
  const engine = factory(window)
  const heap = async () => {
    for (let i = 0; i < 4; ++i) {
      await new Promise(resolve => setImmediate(resolve))
      global.gc!()
    }
    return process.memoryUsage().heapUsed
  }
  engine.match('body:not(.missing)', window.document.body)
  engine.configure({}, true)
  const initial = await heap()
  const start = performance.now()
  for (let i = 0; i < 1800; ++i) {
    engine.compile(
      '[data-key="' + i + '_' + 'value'.repeat(160) + '"]:not(.off)',
      false,
    )
  }
  const compilationMilliseconds = performance.now() - start
  const retained = (await heap()) - initial
  const cache = Reflect.get(engine, 'matchLambdas')
  const entries = cache.size()
  const estimatedBytes = cache.bytes?.() ?? null
  engine.configure({}, true)
  const cleared = (await heap()) - initial
  const ref = (() => {
    const anchor = window.document.createElement('aside')
    anchor.innerHTML =
      '<div class="card">'.repeat(64) +
      '<i class="witness"></i>' +
      '</div>'.repeat(64)
    assert.equal(engine.select('.card:has(.witness)', anchor).length, 64)
    assert.equal(engine.select('.card:has(.witness)', anchor).length, 64)
    engine.select('body', window.document)
    return new WeakRef(anchor)
  })()
  await heap()
  assert.equal(ref.deref(), undefined, 'Detached context retained')
  console.log(
    JSON.stringify({
      retained,
      cleared,
      entries,
      estimatedBytes,
      compilationMilliseconds,
      detachedCollected: true,
    }),
  )
  window.close()
} else {
  assert.ok(
    baseline && candidate && output,
    'Usage: memory.mts baseline.cjs candidate.cjs output.json',
  )
  const files = [baseline, candidate]
  const samples = []
  for (let round = 0; round < 3; ++round) {
    for (let turn = 0; turn < 2; ++turn) {
      const index = (round + turn) % 2
      const sample = JSON.parse(
        execFileSync(
          process.execPath,
          [
            '--expose-gc',
            import.meta.filename,
            '--worker',
            path.resolve(files[index]!),
          ],
          { encoding: 'utf8', cwd: process.cwd() },
        ),
      )
      samples.push({ round, index, ...sample })
      console.log(JSON.stringify({ round, index, ...sample }))
    }
  }
  writeFileSync(
    output,
    JSON.stringify(
      {
        node: process.version,
        files: files.map(file => ({
          file,
          sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
        })),
        samples,
      },
      null,
      2,
    ) + '\n',
  )
}
