import { nextCompileIdentifier } from '../state.mts'
import { inlineLogical } from '../logical.mts'
import { inlineRelative } from '../relative.mts'
import { typeUnionCondition } from './type-union.mts'
import type { CompileState } from '../state.mts'

export function compilePseudoLogical(
  state: CompileState,
): string | false | undefined {
  var compileLogicalCompoundDone = false
  var compileLogicalCompoundValue!: string | false | undefined

  state.match![1] = state.match![1]!.toLowerCase()
  state.expr = state.match![2]!.replace(/\x22/g, '\\"')
  switch (state.match![1]!) {
    case 'is':
    case 'where':
      if (inlineLogical(state, state.match![2]!, false)) {
        break
      }
      {
        compileLogicalCompound()
        if (compileLogicalCompoundDone) {
          return compileLogicalCompoundValue
        }
      }
      break
    case 'matches':
      if (!state.engine.validateLogical(state.match![2]!, false)) {
        return ''
      }
      state.source = 'if(s.match("' + state.expr + '",e)){' + state.source + '}'
      break
    case 'not':
      if (inlineLogical(state, state.match![2]!, true)) {
        break
      }
      if (state.engine.hasPseudoElement(state.match![2]!)) {
        state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
        return ''
      }
      if (state.engine.isCompound((state.argument = state.match![2]!))) {
        state.flag = nextCompileIdentifier(state, '_n')
        state.nested = state.engine.compileSelector(
          state.argument,
          state.flag + '=true;',
          state.mode,
          state.callback,
          undefined,
          state.compiler,
        )
        state.source =
          'var ' +
          state.flag +
          '=false;' +
          state.nested +
          'if(!' +
          state.flag +
          '){' +
          state.source +
          '}'
      } else {
        if (!state.engine.validateLogical(state.match![2]!, false)) {
          return ''
        }
        state.source =
          'if(!s.match("' + state.expr + '",e)){' + state.source + '}'
      }
      break
    case 'has':
      return compileHas(state)
    default:
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      break
  }

  function compileLogicalCompound() {
    if (
      /^(?:[a-z][a-z0-9-]*)?(?:[.#][_a-zA-Z][-\w]*)+$/.test(state.match![2]!)
    ) {
      // A simple compound cannot move e or contain an invalid
      // forgiving-list item, so its predicate can guard the
      // continuation directly without a temporary boolean.
      state.source = state.engine.compileSelector(
        state.match![2]!,
        state.source,
        state.mode,
        state.callback,
        undefined,
        state.compiler,
      )
    } else if (
      /^[a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)*$/.test(
        state.match![2]!,
      )
    ) {
      // The local name is invariant across the union, so it is read
      // once into the shared temp instead of once per member. Hosts
      // keep the matchesTag fallback for foreign and legacy names.
      state.source =
        'if(' +
        typeUnionCondition(state, state.engine.splitList(state.match![2]!)) +
        '){' +
        state.source +
        '}'
    } else if (state.engine.Config.FORGIVING) {
      var resolverKey = state.engine.forgivingKey(
        state.engine.splitList(state.match![2]!),
      )
      state.source =
        'if(s.matchForgivingKey(' +
        JSON.stringify(resolverKey) +
        ',e)){' +
        state.source +
        '}'
    } else {
      if (!state.engine.validateLogical(state.match![2]!, false)) {
        {
          compileLogicalCompoundValue = ''
          compileLogicalCompoundDone = true
          return
        }
      }
      state.source = 'if(s.match("' + state.expr + '",e)){' + state.source + '}'
    }
  }
  return undefined
}

function compileHas(state: CompileState) {
  state.argument = state.engine.prepareHas(state.match![2]!)
  if (state.argument === null) {
    state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
    return ''
  }
  state.match![2] = state.argument
  if (!state.engine.validateLogical(state.match![2]!, true)) {
    return ''
  }
  if (inlineRelative(state, state.match![2]!)) {
    return undefined
  }
  var child = /^>[\t\n\f\r ]*([a-z][a-z0-9-]*|\*)$/.exec(state.match![2]!)
  if (child) {
    state.source = 'if(s.hasChild(e,"' + child[1] + '")){' + state.source + '}'
    return undefined
  }
  state.source =
    'if(s.has(' +
    JSON.stringify(state.match![2]!) +
    ',e)){' +
    state.source +
    '}'
  return undefined
}
