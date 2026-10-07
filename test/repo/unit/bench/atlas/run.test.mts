import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'

test('atlas command regenerates portable charts, searchable HTML and the exact input report', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-atlas-run-'))
  const input = path.join(directory, 'results.json')
  const script = path.resolve('scripts/repo/bench/atlas/run.mts')
  const metadata = {
    engines: [{ name: 'nwsapi' }, { name: 'other' }],
    rounds: 3,
    timestamp: '2026-10-07',
  }
  const rows = [
    {
      category: 'class',
      selector: '.a',
      milliseconds: [1, 2],
      errors: [null, null],
    },
  ]
  try {
    const raw = JSON.stringify({ metadata, rows })
    writeFileSync(input, raw)
    assert.equal(
      spawnSync(process.execPath, [script, '--input', input]).status,
      0,
    )
    const output = path.join(directory, 'atlas')
    assert.deepEqual(readdirSync(output).toSorted(), [
      'chart-1.svg',
      'index.html',
      'measurements.json',
    ])
    assert.equal(
      readFileSync(path.join(output, 'measurements.json'), 'utf8'),
      raw,
    )
    const dom = new JSDOM(readFileSync(path.join(output, 'index.html'), 'utf8'))
    assert.equal(dom.window.document.querySelectorAll('figure').length, 1)
    assert.equal(
      dom.window.document.querySelector('figure img')!.getAttribute('src'),
      'chart-1.svg',
    )
    dom.window.close()
    writeFileSync(
      input,
      JSON.stringify({
        metadata: {
          ...metadata,
          runtime: 'Node',
          power: 'AC',
          candidateSha256: 'engine',
        },
        rows,
      }),
    )
    assert.equal(
      spawnSync(process.execPath, [
        script,
        '--input',
        input,
        '--output',
        path.join(directory, 'custom'),
      ]).status,
      0,
    )
    assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0)
    assert.equal(spawnSync(process.execPath, [script]).status, 1)
    writeFileSync(input, '{}')
    assert.equal(
      spawnSync(process.execPath, [script, '--input', input]).status,
      1,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
