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
      if (state.engine.hasPseudoElement(state.match![2]!)) {
        state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
        return ''
      }
      if (state.engine.isCompound((state.argument = state.match![2]!))) {
        state.flag = '_n' + state.engine.notFlag++
        state.nested = state.engine.compileSelector(
          state.argument,
          state.flag + '=true;',
          state.mode,
          state.callback,
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
      state.argument = state.engine.prepareHas(state.match![2]!)
      if (state.argument === null) {
        state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
        return ''
      }
      state.match![2] = state.argument
      if (!state.engine.validateLogical(state.match![2]!, true)) {
        return ''
      }
      var child = /^>[\t\n\f\r ]*([a-z][a-z0-9-]*|\*)$/.exec(state.match![2]!)
      if (child) {
        state.source =
          'if(s.hasChild(e,"' + child[1] + '")){' + state.source + '}'
        break
      }
      state.source =
        'if(s.has(' +
        JSON.stringify(state.match![2]!) +
        ',e)){' +
        state.source +
        '}'
      break
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
      )
    } else if (
      /^[a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)*$/.test(
        state.match![2]!,
      )
    ) {
      state.source =
        'if(' +
        state.engine
          .splitList(state.match![2]!)
          .map(function (tag) {
            return state.engine.HTML_DOCUMENT
              ? '(' +
                  state.read.tag('e') +
                  '==' +
                  JSON.stringify(state.engine.asciiLower(tag)) +
                  '||s.matchesTag(e,' +
                  JSON.stringify(tag) +
                  '))'
              : state.read.tag('e') + '=="' + tag + '"'
          })
          .join('||') +
        '){' +
        state.source +
        '}'
    } else if (state.engine.Config.FORGIVING) {
      state.source =
        'if(s.matchForgiving(' +
        JSON.stringify(state.engine.splitList(state.match![2]!)) +
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
