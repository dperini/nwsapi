import { expect, test } from 'vitest'
import vm from 'node:vm'
import {
  functionSource,
  replaceFunction,
  routeBundle,
} from '../../../../../../scripts/repo/bench/planner/has/instrument.mts'

const source = `
function selectBulkHas(engine,plan,context,anchors) {
  if (!anchors.length) { return []; }
  var witnesses = engine.witnesses;
  if (witnesses.length > anchors.length * 2) { return 'forward'; }
  if (!engine.weak) { return 'capability'; }
  return 'inverse';
}
function runSingle() { return 'resolver'; }
module.exports={bulk:selectBulkHas,single:runSingle};`
function execute(code: string) {
  const module = {
    exports: {} as {
      bulk: (
        engine: unknown,
        plan: unknown,
        context: unknown,
        anchors: unknown[],
      ) => unknown
      single: () => string
      trace: () => { route: string; facts: { weakMapAvailable: boolean } }
      probes: () => number
      features: () => number[]
    },
  }
  vm.runInNewContext(code, { module })
  return module.exports
}
test('extracts and replaces parsed functions without changing unrelated literals', () => {
  const code = 'function probe(){return /a/.test("a")} var other="probe";'
  const fn = functionSource(code, 'probe')
  expect(vm.runInNewContext(fn + ';probe()')).toBe(true)
  const replaced = replaceFunction(
    code,
    'probe',
    'function probe(){return false}',
  )
  expect(vm.runInNewContext(replaced + ';[probe(),other]')).toEqual([
    false,
    'probe',
  ])
})
test.each(['forward', 'inverse'] as const)(
  'forces only the parsed decision to %s',
  choice => {
    const engine = execute(routeBundle(source, choice))
    expect(
      engine.bulk({ witnesses: Array(4), weak: true }, {}, null, Array(2)),
    ).toBe(choice)
  },
)
test('traces preflight capability resolver and forced decisions', () => {
  const engine = execute(routeBundle(source, 'baseline', true))
  const plan = { denseInverse: true, attributeMask: 1 }
  expect(engine.bulk({ witnesses: [] }, plan, null, [])).toEqual([])
  expect(engine.trace().route).toBe('empty')
  expect(
    engine.bulk({ witnesses: Array(8), weak: true }, plan, null, Array(2)),
  ).toBe('forward')
  expect(engine.trace().route).toBe('forward')
  expect(
    engine.bulk({ witnesses: Array(1), weak: false }, plan, null, Array(2)),
  ).toBe('capability')
  expect(engine.trace().facts.weakMapAvailable).toBe(false)
  expect(
    engine.bulk({ witnesses: Array(1), weak: true }, plan, null, Array(2)),
  ).toBe('inverse')
  expect(engine.probes()).toBe(3)
  expect(engine.features()).toEqual([2, 1, 1, 0.5])
  expect(engine.single()).toBe('resolver')
})
test.each(['function other(){}', 'function probe(){}function probe(){}'])(
  'rejects missing or duplicate functions',
  code => {
    expect(() => functionSource(code, 'probe')).toThrow(Error)
  },
)
test('rejects overlapping edits created by nested return expressions', () => {
  const nested = `function selectBulkHas(engine,plan,context,anchors){
    if (!anchors.length) { return function(){return []}; }
    var witnesses=engine.witnesses;
    if(witnesses.length > anchors.length * 2){return 'forward'}
    return 'inverse';
  }function runSingle(){return 'resolver'}module.exports={};`
  expect(() => routeBundle(nested, 'baseline', true)).toThrow(Error)
})
test.each([
  'witnesses.length === anchors.length * 2',
  'other.length > anchors.length * 2',
  'witnesses.size > anchors.length * 2',
  'witnesses.length > 2',
  'witnesses.length > anchors.length + 2',
  'witnesses.length > other.length * 2',
  'witnesses.length > anchors.size * 2',
  'witnesses.length > anchors * 2',
])('rejects an unsupported ratio expression %s', expression => {
  const candidate = `function selectBulkHas(engine,plan,context,anchors){
    if(!anchors.length){return []}
    var witnesses=engine.witnesses;
    if(${expression}){return 'forward'}
    return 'inverse';
  }function runSingle(){return 'resolver'}module.exports={};`
  expect(() => routeBundle(candidate, 'baseline', true)).toThrow(Error)
})
