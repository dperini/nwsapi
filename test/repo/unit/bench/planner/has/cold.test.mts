import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { gzipSync } from 'node:zlib'
const state = vi.hoisted(() => ({
  write: vi.fn(),
  wrong: false,
  entries: [
    {
      id: 'empty',
      family: 'flat',
      plannerFeatures: [1, 1, 1, 0],
      html: '<p></p>',
      selector: '.none',
    },
    {
      id: 'dense',
      family: 'flat',
      plannerFeatures: [1, 1, 1, 4],
      html: '<p></p>',
      selector: 'p',
    },
    {
      id: 'other',
      family: 'tree',
      plannerFeatures: [1, 1, 1, 4],
      html: '<p></p>',
      selector: 'p',
    },
  ],
}))
vi.mock('node:fs', () => ({
  writeFileSync: state.write,
  readFileSync: (file: string) =>
    file.endsWith('fixtures.json.gz')
      ? gzipSync(JSON.stringify(state.entries))
      : Buffer.from('engine'),
}))
vi.mock('node:module', () => ({
  createRequire: () => () => () => ({
    select: (selector: string, doc: Document) =>
      state.wrong ? [doc.body] : doc.querySelectorAll(selector),
  }),
}))
vi.mock('../../../../../../scripts/repo/bench/footprint/shared.mts', () => ({
  median: (values: number[]) => values[0],
  provenance: () => ({ fixture: true }),
  sha256: () => 'hash',
}))
vi.mock('../../../../../../scripts/repo/bench/planner/has/power.mts', () => ({
  checkedPower: () => 'AC',
}))
const argv = process.argv.slice()
beforeEach(() => {
  vi.resetModules()
  state.write.mockClear()
  state.wrong = false
  process.argv = [argv[0]!, 'cold.mts', '/fixture/baseline', '/fixture/results']
})
afterEach(() => {
  process.argv = argv
})
test('checks cold fresh-engine selections and saves rotated samples', async () => {
  await import('../../../../../../scripts/repo/bench/planner/has/cold.mts')
  const result = JSON.parse(state.write.mock.calls[0]![1])
  expect(result.rows.map((row: { id: string }) => row.id)).toEqual([
    'empty',
    'dense',
  ])
  expect(
    result.rows.every((row: { samples: number[][] }) =>
      row.samples.every(values => values.length === 25),
    ),
  ).toBe(true)
  expect(result.metadata.rounds).toBe(25)
  expect(result.metadata.powerAfter).toBe('AC')
})
test('rejects incorrect ordered cold results', async () => {
  state.wrong = true
  await expect(
    import('../../../../../../scripts/repo/bench/planner/has/cold.mts'),
  ).rejects.toMatchObject({ code: 'ERR_ASSERTION' })
  expect(state.write).not.toHaveBeenCalled()
})
test('requires a baseline and saved directory', async () => {
  process.argv = [argv[0]!, 'cold.mts']
  await expect(
    import('../../../../../../scripts/repo/bench/planner/has/cold.mts'),
  ).rejects.toBeInstanceOf(Error)
})
