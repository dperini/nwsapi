import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { report } from '../../../../../../scripts/repo/bench/planner/dispatch/report.mts'

test('dispatch reports render reserved groups and cached decision comparisons separately', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-dispatch-report-'),
  )
  const output = path.join(directory, 'report.html')
  const metric = {
    cases: 1,
    geometricSpeedRatio: 2,
    totalTimeSpeedRatio: 2,
    worstTimeRatio: 0.8,
    passesGate: true,
  }
  const rows = [
    { family: 'dispatch-template-8', costs: [100, 90, 80, 70, 60] },
    { family: 'development', costs: [100, 80, 90, 60, 70] },
    { family: 'dispatch-template-6', costs: [100, 90, 80, 70, 60] },
  ]
  const write = (file: string, value: unknown) =>
    writeFileSync(path.join(directory, file), JSON.stringify(value))
  try {
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const cached = iteration === 1
      const summary = {
        model: metric,
        simpleRule: metric,
        ...(cached
          ? {
              cachedModel: { ...metric, passesGate: false },
              cachedRule: metric,
            }
          : {}),
      }
      const metadata = {
        power: '<AC>',
        powerAfter: '<AC>',
        status: cached ? 'validation-passed' : 'failed',
        labels: cached
          ? ['Baseline', 'Rule', 'Model', 'Cached model', 'Cached rule']
          : ['Baseline', 'Rule', 'Model'],
        ...(cached
          ? {
              familyCounts: { train: 4, validation: 2, evaluation: 2 },
              trainingScope: 'reserved',
              decisionCache: 'counts',
            }
          : {}),
      }
      const summaries = {
        evaluation: summary,
        validation: summary,
        ...(iteration === 2 ? {} : { development: summary }),
      }
      write('chromium.json', { metadata, rows, summaries })
      write('jsdom.json', { metadata, rows, summaries })
      write('parity.json', {
        cases: { chromium: 10, jsdom: 10 },
        mismatches: 0,
        ...(cached ? { ruleCases: { chromium: 10, jsdom: 10 } } : {}),
      })
      report(directory, output, cached ? '<scope>' : undefined)
      const dom = new JSDOM(readFileSync(output, 'utf8'))
      try {
        assert.equal(
          dom.window.document.querySelectorAll('section').length,
          iteration === 2 ? 4 : 6,
        )
        assert.equal(
          dom.window.document.querySelectorAll('section:first-of-type .row')
            .length,
          cached ? 5 : 3,
        )
        assert.equal(
          dom.window.document.querySelector(
            'section:first-of-type .row strong',
          )!.textContent,
          '100.0%',
        )
        assert.equal(
          dom.window.document
            .querySelector('pre')!
            .textContent!.includes('<AC>'),
          true,
        )
      } finally {
        dom.window.close()
      }
    }
    const script = path.resolve(
      'scripts/repo/bench/planner/dispatch/report.mts',
    )
    assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0)
    assert.equal(spawnSync(process.execPath, [script]).status, 1)
    assert.equal(
      spawnSync(process.execPath, [script, directory, output]).status,
      0,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
