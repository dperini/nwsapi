import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { test } from 'vitest'
import { reportAdaptive } from '../../../../../../scripts/repo/bench/planner/adaptive/report.mts'

test('adaptive reports derive complete query and inference comparisons from recorded inputs', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-adaptive-report-'),
  )
  const collection = path.join(directory, 'collection&')
  const scalar = path.join(directory, 'scalar')
  const oracle = path.join(directory, 'oracle')
  const model = path.join(directory, 'model')
  const confirmation = path.join(directory, 'confirmation')
  const output = path.join(directory, 'report.html')
  const directories = [collection, scalar, oracle, model, confirmation]
  const write = (parent: string, file: string, value: unknown) =>
    writeFileSync(path.join(parent, file), JSON.stringify(value))
  try {
    for (
      let index = 0, length = directories.length;
      index < length;
      index += 1
    ) {
      mkdirSync(directories[index]!)
    }
    const timing = {
      metadata: { labels: ['baseline', 'rule', 'model'], power: 'AC' },
      rows: [
        { id: 'one', costs: [100, 80, 90, 50, 70] },
        { id: 'two', costs: [100, 80, 90, 50, 70] },
      ],
    }
    const hosts = ['chromium', 'jsdom']
    for (let index = 0, length = hosts.length; index < length; index += 1) {
      write(collection, `${hosts[index]}-training.json`, timing)
      write(confirmation, `${hosts[index]}.json`, {
        ...timing,
        summary: { cases: 2, passes: false },
      })
    }
    write(oracle, 'oracle.json', {
      results: {
        chromium: { conservativeSpeedRatio: 2 },
        jsdom: { conservativeSpeedRatio: 2 },
      },
    })
    const inference = {
      baseline: { medianNs: 10 },
      reference: { medianNs: 100 },
      scalar: { medianNs: 50 },
      folded: { medianNs: 25 },
    }
    write(scalar, 'overhead.json', {
      node: inference,
      browser: { results: inference },
    })
    write(model, 'evaluation.json', {
      selected: { hidden: 8, epoch: 10 },
      trainingRows: 100,
      validationRows: 20,
      developmentRows: 40,
    })
    write(model, 'parity.json', { cases: 2000, decisionDisagreements: 0 })
    assert.equal(
      reportAdaptive(collection, scalar, oracle, model, confirmation, output),
      output,
    )
    const dom = new JSDOM(readFileSync(output, 'utf8'))
    try {
      assert.equal(dom.window.document.querySelectorAll('.chart').length, 6)
      assert.equal(
        dom.window.document.querySelectorAll('.chart .row').length,
        20,
      )
      assert.equal(
        dom.window.document.querySelector('.stat b')!.textContent,
        '8 hidden units',
      )
      assert.equal(
        dom.window.document.querySelector('footer code')!.textContent,
        collection,
      )
      assert.equal(dom.window.document.querySelectorAll('.context').length, 6)
    } finally {
      dom.window.close()
    }
    const summary = JSON.parse(
      readFileSync(path.join(confirmation, 'summary.json'), 'utf8'),
    )
    assert.deepEqual(summary, {
      chromium: {
        prefixCeilingSpeedRatio: 2,
        integrated: { cases: 2, passes: false },
      },
      jsdom: {
        prefixCeilingSpeedRatio: 2,
        integrated: { cases: 2, passes: false },
      },
    })
    const script = path.resolve(
      'scripts/repo/bench/planner/adaptive/report.mts',
    )
    assert.equal(spawnSync(process.execPath, [script, '--help']).status, 0)
    assert.equal(spawnSync(process.execPath, [script]).status, 1)
    assert.equal(
      spawnSync(process.execPath, [
        script,
        collection,
        scalar,
        oracle,
        model,
        confirmation,
        output,
      ]).status,
      0,
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
