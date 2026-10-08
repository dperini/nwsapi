import { expect, test } from 'vitest'
import vm from 'node:vm'
import {
  splitDispatchBundle,
  unfilteredCertificate,
} from '../../../../../../scripts/repo/bench/planner/dispatch/specialize.mts'

function model(category = 'attributes === 1 || dense === 1', extra = '') {
  return `export function dispatchOverride(anchors,witnesses,attributes,dense,ratio) {
    if (!(${category})) { return false; }
    ${extra}
    if (anchors < 0 || anchors > 192 || !Number.isFinite(anchors)) { return false; }
    if (ratio < 0 || ratio > 4 || !Number.isFinite(ratio)) { return false; }
    return true;
  }`
}
const source = `
function prepare() { var anchor=null,parts=['','','']; return {anchor: anchor, denseInverse:false}; }
function selectBulkHas(engine,plan,context,anchors) {
  if (!anchors.length) { return []; }
  var witnesses = engine.witnesses;
  if (witnesses.length > anchors.length * 2 && (!plan.denseInverse || anchors.length > 192 || witnesses.length > anchors.length * 4)) { return 'forward'; }
  if (!engine.weak) { return 'capability'; }
  return 'inverse';
}
function runSingle() { return 'resolver'; }
function invoke(engine,plan,context,list) { var bulk = selectBulkHas(engine, plan.bulkHas, context, list); return bulk; }
module.exports={invoke:invoke,prepare:prepare};`

test.each([
  'attributes === 1 || dense === 1',
  'attributes === 0 && dense === 1',
  'dense === 1 || attributes === 1',
  'dense === 1',
])('certifies conservative unfiltered category %s', category => {
  expect(unfilteredCertificate(model(category))).toMatchObject({
    anchorUpperBound: 192,
    ratioUpperBound: 4,
  })
})
test.each([
  'anchors <= 2',
  'obj.anchors > 2',
  'anchors > witnesses',
  'anchors > "2"',
  'anchors > 1e400',
  '!Number["isFinite"](anchors)',
  '!Math.isFinite(anchors)',
  '!Number.other(anchors)',
  '!Number.isFinite()',
  '!Number.isFinite(1)',
  '!Number.isFinite(anchors,ratio)',
  '~Number.isFinite(anchors)',
  '!anchors',
  'anchors === 1',
  'witnesses > 2',
])('ignores terms outside its numeric proof grammar %s', term => {
  expect(
    unfilteredCertificate(model(undefined, `if (${term}) { return false; }`))
      .anchorUpperBound,
  ).toBe(192)
})
test.each([
  'attributes === 0 || dense === 1',
  'attributes === 1 && dense === 1',
  'dense == 1',
  '1 === dense',
  'dense === anchors',
  'unknown === 1',
  'dense === 1 ?? attributes === 1',
])('rejects uncertifiable category %s', category => {
  expect(() => unfilteredCertificate(model(category))).toThrow(
    expect.objectContaining({ code: 'ERR_ASSERTION' }),
  )
})
test.each([
  'function other(anchors,witnesses,attributes,dense,ratio) {}',
  'const dispatchOverride=()=>false',
  'function dispatchOverride() {}',
  'function dispatchOverride(anchors,witnesses,attributes,dense,ratio) { if (dense === 1) { return false; } return true; }',
  'function dispatchOverride(anchors,witnesses,attributes,dense,ratio) { if (!dense) {} return true; }',
  'function dispatchOverride(anchors,witnesses,attributes,dense,ratio) { if (!dense) { return true; } return false; }',
  'function dispatchOverride(anchors,witnesses,attributes,dense,ratio) { if (!dense) { throw 1; } return true; }',
  'function dispatchOverride(anchors,witnesses,attributes,dense,ratio) { if (!dense) { return false; } else { return true; } }',
  'function dispatchOverride(anchors,witnesses,attributes,dense,ratio) { if (!dense) return false; return true; }',
])('rejects incompatible model declaration %s', code => {
  expect(() => unfilteredCertificate(code)).toThrow(
    expect.objectContaining({ code: 'ERR_ASSERTION' }),
  )
})
test('requires a bounded dense domain and one model function', () => {
  const tooLarge =
    'function dispatchOverride(anchors,witnesses,attributes,dense,ratio) {if (!(attributes === 1 || dense === 1)) {return false;} if (anchors > 193) {return false;} if (ratio > 5) {return false;}return true;}'
  expect(() => unfilteredCertificate(tooLarge)).toThrow(
    expect.objectContaining({ code: 'ERR_ASSERTION' }),
  )
  expect(() => unfilteredCertificate(model() + ';function extra() {}')).toThrow(
    expect.objectContaining({ code: 'ERR_ASSERTION' }),
  )
  expect(() => unfilteredCertificate(model().slice(0, 0))).toThrow(
    expect.objectContaining({ code: 'ERR_ASSERTION' }),
  )
})
test.each([false, true])(
  'splits attribute paths while retaining exact baseline routing instrument %s',
  instrument => {
    const code = splitDispatchBundle(source, model(), instrument)
    const module = {
      exports: {} as {
        invoke: (
          engine: unknown,
          plan: unknown,
          context: unknown,
          list: unknown[],
        ) => unknown
        trace: () => { route: string }
      },
    }
    vm.runInNewContext(code, { module })
    const engine = { witnesses: Array(80), weak: true }
    const plain = { bulkHas: { attributeMask: 0, denseInverse: false } }
    const filtered = { bulkHas: { attributeMask: 1, denseInverse: false } }
    expect(module.exports.invoke(engine, plain, null, Array(32))).toBe(
      'forward',
    )
    expect(module.exports.invoke(engine, filtered, null, Array(32))).toBe(
      'inverse',
    )
    if (instrument) {
      expect(module.exports.trace().route).toBe('inverse')
    }
  },
)
test('rejects incompatible baseline routing or missing caller', () => {
  expect(() =>
    splitDispatchBundle('function selectBulkHas() {return null}', model()),
  ).toThrow(expect.objectContaining({ code: 'ERR_ASSERTION' }))
  expect(() =>
    splitDispatchBundle(
      source.slice(0, source.indexOf('function invoke')),
      model(),
    ),
  ).toThrow(expect.objectContaining({ code: 'ERR_ASSERTION' }))
})
