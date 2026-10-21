import path from 'node:path'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import {
  lifecycleFixture,
  lifecycleMain,
  lifecycleSelectors,
  parseLifecycleOptions,
} from '../../../../../../scripts/repo/bench/survey/lifecycle/run.mts'

test('lifecycle options validate inputs and expose side-effect-free description and planning', () => {
  expect(parseLifecycleOptions(['--describe', '--json'])).toEqual({
    describe: true,
  })
  expect(
    parseLifecycleOptions([
      '--baseline',
      'before.gz',
      '--candidate',
      'after.gz',
      '--output',
      'results',
      '--rounds',
      '3',
      '--repeat',
      '--dry-run',
      '--json',
    ]),
  ).toEqual({
    describe: false,
    baseline: path.resolve('before.gz'),
    candidate: path.resolve('after.gz'),
    output: path.resolve('results'),
    rounds: 3,
    repeat: true,
    dryRun: true,
    json: true,
  })
  expect(() => parseLifecycleOptions([])).toThrow(/baseline/)
  expect(() =>
    parseLifecycleOptions([
      '--baseline',
      'a',
      '--candidate',
      'b',
      '--output',
      'c',
      '--rounds',
      '0',
    ]),
  ).toThrow(/rounds/)
})

test('lifecycle fixture preserves both document bodies and meaningful query matches', t => {
  const { window } = new JSDOM(lifecycleFixture())
  t.onTestFinished(() => window.close())
  expect(window.document.compatMode).toBe('CSS1Compat')
  for (const selector of lifecycleSelectors) {
    expect(
      window.document.querySelectorAll(selector).length,
      selector,
    ).toBeGreaterThan(0)
  }
})

test('description and dry run require no bundle reads or measurement side effects', async () => {
  expect(await lifecycleMain(['--describe'])).toHaveProperty('cold')
  expect(
    await lifecycleMain([
      '--baseline',
      'missing-before.cjs',
      '--candidate',
      'missing-after.cjs',
      '--output',
      'missing-output',
      '--dry-run',
    ]),
  ).toMatchObject({
    output: path.resolve('missing-output'),
    dryRun: true,
  })
})
