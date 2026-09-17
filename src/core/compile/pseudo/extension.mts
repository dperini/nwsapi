import type { CompileState } from '../state.mts'

export function compilePseudoExtension(
  state: CompileState,
): string | false | undefined {
  // reset
  state.expr = false
  state.status = false

  // process registered selector extensions
  for (var extension in state.engine.Selectors) {
    state.expr = extension
    if (
      (state.match = state.selector.match(
        state.engine.Selectors[state.expr]!.Expression,
      ))
    ) {
      state.result = state.engine.Selectors[state.expr]!.Callback(
        state.match,
        state.source,
        state.mode,
        state.callback,
      )
      if ('match' in state.result) {
        state.match = state.result.match
      }
      state.vars = state.result.modvar
      if (state.mode) {
        // add extra select() vars
        state.vars &&
          state.engine.S_VARS.indexOf(state.vars) < 0 &&
          (state.engine.S_VARS[state.engine.S_VARS.length] = state.vars)
      } else {
        // add extra match() vars
        state.vars &&
          state.engine.M_VARS.indexOf(state.vars) < 0 &&
          (state.engine.M_VARS[state.engine.M_VARS.length] = state.vars)
      }
      // extension source code
      state.source = state.result.source
      // extension status code
      state.status = state.result.status
      // break on status error
      if (state.status) {
        break
      }
    }
  }

  if (!state.status) {
    state.engine.emit("unknown pseudo-class selector '" + state.selector + "'")
    return ''
  }

  if (!state.expr) {
    state.engine.emit("unknown token in selector '" + state.selector + "'")
    return ''
  }
  return undefined
}
