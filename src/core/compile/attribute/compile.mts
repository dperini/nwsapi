import { attributeCondition } from './condition.mts'
import type { CompileState } from '../state.mts'
import type { AttributeOperator } from '../../state/types.mts'

export function compileAttribute(
  state: CompileState,
): string | false | undefined {
  var normalizeAttributeValueDone = false
  var normalizeAttributeValueValue!: string | false | undefined

  state.match = state.selector.match(state.engine.Patterns['attribute']!)
  if (!state.match) {
    return undefined
  }
  state.NS = /^\[[\t\n\f\r ]*\*\|/.test(state.match![0])
  state.name = state.match![1]!
  var parts = state.engine.unescapeIdentifier(state.name).split(':')
  state.expr = (parts.length == 2 ? parts[1] : parts[0])!
  state.name = state.engine
    .escapeIdentifier(state.name)
    .replace(/\\.|\x22/g, function (part: string) {
      return part == '"' ? '\\"' : part
    })
  state.attributeSource = state.read.attr('e', state.name)
  state.attributeGuard = ''
  if (
    !state.NS &&
    (!state.engine.HTML_DOCUMENT || /^\[[\t\n\f\r ]*\|/.test(state.match![0]))
  ) {
    state.attributeSource = 'n'
    state.attributeGuard = 'n=s.attributeValueNS(e,"' + state.name + '");'
  }
  if (
    state.match![2]! &&
    !(state.test = state.engine.Operators[state.match![2]!])
  ) {
    state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
    return ''
  }
  {
    normalizeAttributeValue()
    if (normalizeAttributeValueDone) {
      return normalizeAttributeValueValue
    }
  }
  prepareAttributePattern()
  if (state.NS && state.match![2]) {
    state.source =
      'if(s.hasAttributeNS(e,"' +
      state.name +
      '",' +
      state.attributePattern +
      ',' +
      (state.test as AttributeOperator).p3 +
      ')){' +
      state.source +
      '}'
    return undefined
  }
  state.source = attributeCondition(state)
  return undefined

  function prepareAttributePattern() {
    state.match![5] = (state.match![5]! || '').toLowerCase()
    state.type =
      state.match![5] == 'i' ||
      (state.match![5]! != 's' &&
        state.engine.HTML_DOCUMENT &&
        state.engine.HTML_TABLE[(state.expr as string).toLowerCase()])
        ? 'i'
        : ''
    if (state.match![2]) {
      state.attributePattern =
        '/' +
        (state.test as AttributeOperator).p1 +
        state.match![4] +
        (state.test as AttributeOperator).p2 +
        '/'
      state.attributePattern =
        !state.match![5] && state.type == 'i'
          ? '(e.namespaceURI=="http://www.w3.org/1999/xhtml"?' +
            state.attributePattern +
            'i:' +
            state.attributePattern +
            ')'
          : state.attributePattern + state.type
    }
  }

  function normalizeAttributeValue() {
    if (state.match![4] === '') {
      state.test =
        state.match![2] == '~='
          ? { p1: '(?!)', p2: '', p3: 'true' }
          : (state.match![2] as string) in state.engine.ATTR_STD_OPS &&
              state.match![2]! != '~='
            ? { p1: '^', p2: '$', p3: 'true' }
            : state.test
    } else if (
      state.match![2] == '~=' &&
      /[\t\n\f\r ]/.test(state.engine.unescapeIdentifier(state.match![4]!))
    ) {
      // A token cannot contain CSS whitespace. Decode first: the
      // space terminating a hexadecimal escape is not part of it.
      state.source = 'if(false){' + state.source + '}'
      {
        normalizeAttributeValueValue = undefined
        normalizeAttributeValueDone = true
        return
      }
    } else if (state.match![4]!) {
      state.value = state.engine.escapeIdentifier(state.match![4]!)
      state.match![4] = state.value.replace(state.engine.REX.RegExpChar, '\\$&')
      state.value = state.value.replace(/\\.|\x22/g, function (part: string) {
        return part == '"' ? '\\"' : part
      })
    }
  }
}
