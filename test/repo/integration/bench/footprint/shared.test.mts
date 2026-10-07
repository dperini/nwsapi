import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('native script consumers compute finite odd and even measurement summaries', () => {
  const module = new URL(
    '../../../../../scripts/repo/bench/footprint/shared.mts',
    import.meta.url,
  ).href
  const code = `const {median,summarize}=await import(${JSON.stringify(module)});console.log(JSON.stringify({odd:median([9,1,5]),even:median([9,1,7,3]),summary:summarize([1,3,7,9])}));`
  const result = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
      encoding: 'utf8',
    }),
  )
  expect(result.odd).toBe(5)
  expect(result.even).toBe(5)
  expect(result.summary).toMatchObject({ median: 5, min: 1, max: 9 })
})
