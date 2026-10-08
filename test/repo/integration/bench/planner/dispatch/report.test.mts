import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'

test('native report CLI validates operands and renders recorded confirmation measurements', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'nwsapi-native-dispatch-report-'),
  )
  const script = path.resolve('scripts/repo/bench/planner/dispatch/report.mts')
  const confirmation = path.resolve(
    'assets/repo/bench/planner-dispatch-crossed-integrated-2026-10-05-r1',
  )
  const output = path.join(directory, 'report.html')
  try {
    expect(spawnSync(process.execPath, [script, '--help']).status).toBe(0)
    expect(spawnSync(process.execPath, [script]).status).toBe(1)
    expect(spawnSync(process.execPath, [script, confirmation]).status).toBe(1)
    expect(
      spawnSync(process.execPath, [script, confirmation, output]).status,
    ).toBe(0)
    const dom = new JSDOM(readFileSync(output, 'utf8'))
    try {
      expect(
        dom.window.document.querySelectorAll('section').length,
      ).toBeGreaterThan(0)
      expect(
        dom.window.document.querySelectorAll('.row').length,
      ).toBeGreaterThan(0)
      expect(dom.window.document.querySelector('pre')).not.toBeNull()
    } finally {
      dom.window.close()
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
