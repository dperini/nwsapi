import type { CompileState } from '../state.mts'
import type { AttributeOperator } from '../../state/types.mts'
export function attributeCondition(state: CompileState) {
  return (
    state.attributeGuard +
    'if((' +
    (state.attributeGuard && state.match![2] ? 'n!==null&&' : '') +
    (!state.match![2]!
      ? state.NS
        ? 's.hasAttributeNS(e,"' + state.name + '")'
        : state.attributeGuard
          ? 'n!==null'
          : state.read.has('e', state.name)
      : !state.match![4]! &&
          state.engine.ATTR_STD_OPS[state.match![2]!] &&
          state.match![2]! != '~='
        ? state.attributeSource + '==""'
        : state.match![2] == '=' &&
            state.type == '' &&
            (state.test as AttributeOperator).p3 == 'true'
          ? state.attributeSource + '=="' + state.value + '"'
          : '(' +
            state.attributePattern +
            ').test(' +
            (state.match![2] == '~=' &&
            (state.test as AttributeOperator).p3 == 'true'
              ? '(' + state.attributeSource + '||"")'
              : state.attributeSource) +
            ')==' +
            (state.test as AttributeOperator).p3) +
    ')){' +
    state.source +
    '}'
  )
}
