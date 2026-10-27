import { parsePure, pureCompiler } from '../pure.mts'
import { nextCompileIdentifier } from '../state.mts'
import type { CompileState } from '../state.mts'

export function compileSiblingPrefix(state: CompileState): string | null {
  if (
    !state.compiler ||
    state.mode !== true ||
    state.callback ||
    state.selector.indexOf('~') < 0 ||
    !pureCompiler(state.engine)
  ) {
    return null
  }
  const chain = parsePure(state.selector)
  if (!chain || chain.compounds.length !== 2 || chain.relations[0] !== '~') {
    return null
  }

  const prefix = nextCompileIdentifier(state, '_sibPrefix')
  state.ancestry.reuse = ''
  const memo = prefix + 'Memo'
  const predicate = state.engine.compileSelector(
    chain.compounds[0]!,
    'r=true;',
    false,
    false,
  )
  const get = prefix + 'Get'
  const set = prefix + 'Set'
  // Backfill visited siblings because each shares the same inclusive-prefix result.
  const helper =
    'function ' +
    get +
    '(map,node){var i;if(map.get){return map.get(node);}for(i=map.length-2;i>=0;i-=2){if(map[i]===node){return map[i+1];}}}' +
    'function ' +
    set +
    '(map,node,value){if(map.set){map.set(node,value);}else{map.push(node,value);}}' +
    'function ' +
    prefix +
    'Test(e){var n,o,r=false;' +
    predicate +
    'return r;}' +
    'function ' +
    prefix +
    '(node,map){var current=node,visited,result=false,cached;' +
    'if(!current){return false;}cached=' +
    get +
    '(map,current);' +
    'if(cached!==undefined){return cached;}if(' +
    prefix +
    'Test(current)){return true;}visited=[current];' +
    'current=current.previousElementSibling;while(current){cached=' +
    get +
    '(map,current);' +
    'if(cached!==undefined){result=cached;break;}visited.push(current);if(' +
    prefix +
    'Test(current)){result=true;break;}current=current.previousElementSibling;}' +
    'for(var i=0;i<visited.length;i++){' +
    set +
    '(map,visited[i],result);}return result;}'
  ;(state.compiler.prelude || (state.compiler.prelude = [])).push(helper)
  // Resolver-local state lets a later query observe sibling moves and mutations.
  ;(state.compiler.variables || (state.compiler.variables = [])).push(
    memo + '=(s.createWeakMap()||[])',
  )

  const source =
    'if(' +
    prefix +
    '(e.previousElementSibling,' +
    memo +
    ')){' +
    state.source +
    '}'
  return state.engine.compileSelector(
    chain.compounds[1]!,
    source,
    state.mode,
    state.callback,
    undefined,
    state.compiler,
  )
}
