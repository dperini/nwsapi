import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

test('native instrumentation preserves decisions and exposes route observations', () => {
  const module = new URL(
    '../../../../../../scripts/repo/bench/planner/has/instrument.mts',
    import.meta.url,
  ).href
  const code = `
    import vm from 'node:vm';
    const {routeBundle,functionSource,replaceFunction}=await import(${JSON.stringify(module)});
    const source="function selectBulkHas(engine,plan,context,anchors){if(!anchors.length){return []}var witnesses=engine.witnesses;if(witnesses.length>anchors.length*2){return 'forward'}if(!engine.weak){return 'capability'}return 'inverse'}function runSingle(){return 'resolver'}module.exports={bulk:selectBulkHas,single:runSingle};";
    const module={exports:{}};
    vm.runInNewContext(routeBundle(source,'baseline',true),{module});
    const engine=module.exports;
    const plan={denseInverse:true,attributeMask:1};
    const empty=engine.bulk({witnesses:[]},plan,null,[]);
    const forward=engine.bulk({witnesses:Array(8),weak:true},plan,null,Array(2));
    const capability=engine.bulk({witnesses:Array(1),weak:false},plan,null,Array(2));
    const inverse=engine.bulk({witnesses:Array(1),weak:true},plan,null,Array(2));
    const probe='function probe(){return /a/.test("a")}';
    const extracted=vm.runInNewContext(functionSource(probe,'probe')+';probe()');
    const replaced=vm.runInNewContext(replaceFunction(probe,'probe','function probe(){return false}')+';probe()');
    console.log(JSON.stringify({empty,forward,capability,inverse,trace:engine.trace().route,probes:engine.probes(),features:engine.features(),single:engine.single(),extracted,replaced}));
  `
  const result = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
      encoding: 'utf8',
    }),
  )
  expect(result).toEqual({
    empty: [],
    forward: 'forward',
    capability: 'capability',
    inverse: 'inverse',
    trace: 'inverse',
    probes: 3,
    features: [2, 1, 1, 0.5],
    single: 'resolver',
    extracted: true,
    replaced: false,
  })
})
