import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('native TypeScript model exports preserve trained and guarded choices', () => {
  const module = new URL(
    '../../../../../scripts/repo/bench/planner/model.mts',
    import.meta.url,
  ).href
  const code = `
    import {compileFunction} from 'node:vm';
    const {train,decide,expression,guardedExpression}=await import(${JSON.stringify(module)});
    const rows=Array.from({length:24},(_,index)=>({features:[index+1,100,2,(index+1)/100],costs:index<12?[1,10]:[10,1]}));
    const tree=train(rows);
    const compiled=compileFunction('return '+expression(tree),['count','total','arity']);
    const guarded=compileFunction('return '+guardedExpression(tree,{min:[1,10,2,0.01],max:[24,100,2,0.24],arities:[2]}),['count','total','arity']);
    console.log(JSON.stringify({direct:[decide(tree,rows[0].features),decide(tree,rows[23].features)],compiled:[compiled(1,100,2),compiled(24,100,2)],guarded:[guarded(1,100,2),guarded(24,100,2),guarded(90,100,3)]}));
  `
  const result = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
      encoding: 'utf8',
    }),
  )
  expect(result).toEqual({
    direct: [false, true],
    compiled: [false, true],
    guarded: [false, true, true],
  })
})
