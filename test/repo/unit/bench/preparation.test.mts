import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, vi } from 'vitest'

vi.mock('../../../../scripts/repo/bench/compare/timing.mts', () => ({
  compareTiming: async (queries: Array<() => unknown>) =>
    queries.map((query, index) => {
      query()
      return [{ p50Ns: (index + 1) * 1_000_000 }]
    }),
}))

test('preparation compares equivalent DOM operations and records measured ratios and source fingerprints', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-preparation-'))
  const source = path.join(directory, 'engine.cjs')
  const output = path.join(directory, 'report.json')
  writeFileSync(
    source,
    `module.exports = () => ({
    select: (selector, context) => Array.from(context.querySelectorAll(selector)),
    closest: (selector, element) => element.closest(selector),
    match: (selector, element) => element.matches(selector),
    configure: () => {},
    compile: selector => nodes => nodes.filter(node => node.matches(selector))
  })`,
  )
  const original = process.argv
  vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    process.argv = [original[0]!, 'preparation.mts', source, source, output]
    const { prepare } =
      await import('../../../../scripts/repo/bench/preparation.mts')
    const invalid = prepare(
      (() => ({})) as unknown as Parameters<typeof prepare>[0],
      {
        name: 'invalid',
        selector: 'div',
        markup: '<div></div>',
        operation: 'invalid',
      } as unknown as Parameters<typeof prepare>[1],
    )
    try {
      assert.throws(invalid.run)
    } finally {
      invalid.close()
    }
    const report = JSON.parse(readFileSync(output, 'utf8'))
    assert.equal(report.rows.length, 13)
    assert.equal(report.sources[0].sha256, report.sources[1].sha256)
    assert.equal(report.sources[0].sha256.length, 64)
    assert.equal(report.settings.rounds, 7)
    assert.deepEqual(
      new Set(report.rows.map((row: { operation: string }) => row.operation)),
      new Set(['select', 'raw', 'closest', 'switch', 'recompile', 'cold']),
    )
    for (
      let index = 0, length = report.rows.length;
      index < length;
      index += 1
    ) {
      assert.deepEqual(report.rows[index].milliseconds, [1, 2])
      assert.equal(report.rows[index].ratio, 0.5)
    }
    const cases = [[], [source], [source, source]]
    for (let index = 0, length = cases.length; index < length; index += 1) {
      vi.resetModules()
      process.argv = [original[0]!, 'preparation.mts', ...cases[index]!]
      await assert.rejects(
        import('../../../../scripts/repo/bench/preparation.mts'),
      )
    }
  } finally {
    process.argv = original
    vi.resetModules()
    rmSync(directory, { recursive: true, force: true })
  }
})
