import { runInNewContext } from 'node:vm'
import { parse } from 'acorn'
import { expect, test } from 'vitest'
import { lowerToEs5 } from '../../../../../scripts/repo/build/post/es5.mts'
test('modern syntax lowers to executable ES5 without changing values', async () => {
  const source = await lowerToEs5(
    'const values=[1,2].map(value=>value+1); result=JSON.stringify(values)',
  )
  expect(() =>
    parse(source, { ecmaVersion: 5, sourceType: 'script' }),
  ).not.toThrow()
  const context = { result: '' }
  runInNewContext(source, context)
  expect(context.result).toBe('[2,3]')
})
