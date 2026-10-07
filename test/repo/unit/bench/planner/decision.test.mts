import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { decisionView } from '../../../../../scripts/repo/bench/planner/decision.mts'
import type { Row } from '../../../../../scripts/repo/bench/planner/measure.mts'

test('decision comparison enforces matching held-out evidence before rendering options', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-decision-'))
  const rows = [
    { id: 'one', split: 'holdout', fixtureSha256: 'fixture', costs: [100, 80] },
    {
      id: 'two',
      split: 'holdout',
      fixtureSha256: 'fixture2',
      costs: [100, 120],
    },
  ] as Row[]
  const results = [
    { host: 'chromium', evaluation: { rows } },
    { host: 'jsdom', evaluation: { rows } },
  ]
  try {
    writeFileSync(
      path.join(directory, 'chromium-preflight.json'),
      JSON.stringify({ rows }),
    )
    writeFileSync(
      path.join(directory, 'jsdom-preflight.json'),
      JSON.stringify({ rows }),
    )
    const passed = new JSDOM(decisionView(directory, results, true))
    assert.equal(passed.window.document.querySelectorAll('.group').length, 2)
    assert.equal(passed.window.document.querySelectorAll('tbody tr').length, 2)
    assert.equal(
      passed.window.document.querySelectorAll('.choices article').length,
      3,
    )
    assert.equal(
      passed.window.document.querySelector('.recommended .option')!.textContent,
      'C · Currently enabled',
    )
    passed.window.close()
    const failed = new JSDOM(decisionView(directory, results, false))
    assert.equal(
      failed.window.document.querySelectorAll('.group .bar').length,
      6,
    )
    failed.window.close()
    assert.throws(() =>
      decisionView(
        directory,
        [{ host: 'chromium', evaluation: { rows: [] } }],
        true,
      ),
    )
    assert.throws(() =>
      decisionView(
        directory,
        [{ host: 'chromium', evaluation: { rows: rows.slice(0, 1) } }],
        true,
      ),
    )
    assert.throws(() =>
      decisionView(
        directory,
        [
          {
            host: 'chromium',
            evaluation: {
              rows: rows.map(row => ({ ...row, fixtureSha256: 'different' })),
            },
          },
        ],
        true,
      ),
    )
    writeFileSync(
      path.join(directory, 'chromium-preflight.json'),
      JSON.stringify({ rows: rows.map(row => ({ ...row, split: 'train' })) }),
    )
    assert.throws(() =>
      decisionView(
        directory,
        [{ host: 'chromium', evaluation: { rows } }],
        true,
      ),
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
