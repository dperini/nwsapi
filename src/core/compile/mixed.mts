import { parsePure, pureCompiler } from './pure.mts'
import type { PureChain } from './pure.mts'
import { nextCompileIdentifier } from './state.mts'
import type { CompileState } from './state.mts'

export function compileMixed(state: CompileState): string | null {
  if (
    !state.compiler ||
    state.callback ||
    !pureCompiler(state.engine) ||
    !/[>+]/.test(state.selector)
  ) {
    return null
  }
  const chain = parsePure(state.selector)
  if (
    !chain ||
    chain.compounds.length < 4 ||
    !chain.relations.some(fixed) ||
    chain.relations.filter(value => !fixed(value)).length < 2
  ) {
    return null
  }
  const prefix = nextCompileIdentifier(state, '_mixed')
  const memo = prefix + 'Memo'
  const functions = chain.compounds
    .map((compound, index) => helper(state, chain, compound, index, prefix))
    .join('')
  ;(state.compiler.prelude || (state.compiler.prelude = [])).push(functions)
  ;(state.compiler.variables || (state.compiler.variables = [])).push(
    memo + '=null',
  )
  const last = chain.compounds.length - 1
  const source =
    greedy(state, chain, prefix) +
    'if(' +
    prefix +
    'Hit||' +
    prefix +
    last +
    '(e,' +
    memo +
    '||(' +
    memo +
    '=[0]))){' +
    state.source +
    '}'
  return state.engine.compileSelector(
    chain.compounds[last]!,
    source,
    state.mode,
    state.callback,
    undefined,
    state.compiler,
  )
}

function fixed(relation: string) {
  return relation === '>' || relation === '+'
}

function step(state: CompileState, relation: string, element: string) {
  return relation === ' ' || relation === '>'
    ? state.read.up(element)
    : state.read.prev(element)
}

function helper(
  state: CompileState,
  chain: PureChain,
  compound: string,
  index: number,
  prefix: string,
) {
  const relation = chain.relations[index - 1]!
  let success = 'r=true;'
  if (index) {
    const call = prefix + (index - 1) + '(e,m)'
    success =
      'e=' +
      step(state, relation, 'e') +
      ';' +
      (fixed(relation)
        ? 'r=!!e&&' + call + ';'
        : 'while(e){if(' +
          call +
          '){r=true;break;}e=' +
          step(state, relation, 'e') +
          ';}')
  }
  const predicate = state.engine.compileSelector(
    compound,
    success,
    false,
    false,
  )
  return (
    'function ' +
    prefix +
    index +
    '(e,m){var n,o,original=e,map=m[' +
    (index + 1) +
    '],r=false;if(map&&map.has(e)){return map.get(e);}if(!map&&++m[0]>64){map=m[' +
    (index + 1) +
    ']=s.createWeakMap();}' +
    predicate +
    'if(map){map.set(original,r);}return r;}'
  )
}

function greedy(state: CompileState, chain: PureChain, prefix: string) {
  const label = prefix + 'Exit'
  const flag = prefix + 'Part'
  let source =
    'var ' +
    prefix +
    'Node=e,' +
    prefix +
    'Hit=false,' +
    flag +
    ';' +
    label +
    ':{'
  for (let i = chain.compounds.length - 2; i >= 0; --i) {
    const relation = chain.relations[i]!
    const advance = 'e=' + step(state, relation, 'e') + ';'
    const predicate = state.engine.compileSelector(
      chain.compounds[i]!,
      flag + '=true;',
      state.mode,
      false,
      undefined,
      state.compiler,
    )
    source += advance + flag + '=false;'
    source += fixed(relation)
      ? 'if(e){' + predicate + '}'
      : 'while(e){' + predicate + 'if(' + flag + '){break;}' + advance + '}'
    source += 'if(!' + flag + '){break ' + label + ';}'
  }
  return source + prefix + 'Hit=true;}e=' + prefix + 'Node;'
}
