import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('native dispatch and has fixture generators preserve unique layouts and integer feature counts', () => {
  const dispatch = new URL(
    '../../../../../../scripts/repo/bench/planner/dispatch/fixtures.mts',
    import.meta.url,
  ).href
  const has = new URL(
    '../../../../../../scripts/repo/bench/planner/has/fixtures.mts',
    import.meta.url,
  ).href
  const code = `
    const {fixtures:dispatch}=await import(${JSON.stringify(dispatch)});
    const {fixtures:has}=await import(${JSON.stringify(has)});
    const sets=[dispatch(),has()];
    console.log(JSON.stringify(sets.map(rows=>({count:rows.length,unique:new Set(rows.map(row=>row.id)).size,valid:rows.every(row=>row.html.length>0&&(!row.plannerFeatures||row.plannerFeatures.every(Number.isFinite)))}))));
  `
  const results = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
      encoding: 'utf8',
    }),
  )
  for (let index = 0, length = results.length; index < length; index += 1) {
    expect(results[index].count).toBeGreaterThan(0)
    expect(results[index].unique).toBe(results[index].count)
    expect(results[index].valid).toBe(true)
  }
})
