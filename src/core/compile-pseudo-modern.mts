import type { CompileState } from './compile-state.d.ts'
import { rejectsHostArgument } from './rejects-host-argument.mts'
export function compilePseudoModern(
  state: CompileState,
): string | false | undefined {
  var compileFunctionalStateDone = false
  var compileFunctionalStateValue!: string | false | undefined

  state.name = state.pseudo!.name
  state.argument = state.pseudo!.argument
  if (state.name == 'lang') {
    var ranges =
        state.argument === null ? [] : state.engine.splitList(state.argument),
      languageTests: string[] = [],
      range,
      quoted
    for (var rangeIndex = 0; rangeIndex < ranges.length; ++rangeIndex) {
      range = ranges[rangeIndex]!
      quoted =
        /^(?:"(?:[^"\\\n\r\f]|\\[^\n\r\f])*"|'(?:[^'\\\n\r\f]|\\[^\n\r\f])*')$/.test(
          range,
        )
      if (!quoted && !state.engine.isIdent(range)) {
        break
      }
      languageTests.push(
        's.isLanguage(e,' +
          JSON.stringify(
            state.engine.unescapeIdentifier(
              quoted ? range.slice(1, -1) : range,
            ),
          ) +
          ')',
      )
    }
    if (!ranges.length || languageTests.length !== ranges.length) {
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      return ''
    }
    state.source = 'if(' + languageTests.join('||') + '){' + state.source + '}'
  } else if (state.name == 'host' || state.name == 'host-context') {
    if (rejectsHostArgument(state)) {
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      return ''
    }
    state.source =
      'if(s.isHost(e,' +
      JSON.stringify(state.argument) +
      ',' +
      (state.name == 'host-context') +
      ',x||(c.nodeType?c:s.from))){' +
      state.source +
      '}'
  } else {
    compileFunctionalState()
    if (compileFunctionalStateDone) {
      return compileFunctionalStateValue
    }
  }
  state.match = [
    state.selector.slice(0, state.selector.length - state.pseudo!.rest.length),
    state.pseudo!.rest,
  ]
  return undefined

  function compileFunctionalState() {
    if (state.name == 'has-slotted') {
      if (
        state.argument !== null &&
        (!state.argument ||
          state.engine.hasPseudoElement(state.argument) ||
          !state.engine.isCompound(
            state.engine.normalizeCombinators(state.argument),
            true,
          ) ||
          !state.engine.validateLogical(state.argument, false))
      ) {
        state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
        {
          compileFunctionalStateValue = ''
          compileFunctionalStateDone = true
          return
        }
      }
      state.source =
        'if(s.hasSlotted(e,' +
        JSON.stringify(state.argument) +
        ')){' +
        state.source +
        '}'
    } else {
      if (
        state.name == 'state'
          ? state.argument === null || !state.engine.isIdent(state.argument)
          : state.name == 'active-view-transition-type'
            ? state.argument === null ||
              !state.engine.splitList(state.argument).every(function (value) {
                return state.engine.isIdent(
                  value.replace(state.engine.REX.TrimSpaces, ''),
                  true,
                )
              })
            : state.argument !== null
      ) {
        state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
        {
          compileFunctionalStateValue = ''
          compileFunctionalStateDone = true
          return
        }
      }
      state.expr =
        ':' +
        state.name +
        (state.argument === null ? '' : '(' + state.argument + ')')
      state.source =
        'if(s.matchesNative(e,' +
        JSON.stringify(state.expr) +
        ')){' +
        state.source +
        '}'
    }
  }
}
