import type { CompileState } from './state.mts'
import { compileToken } from './token.mts'
import type {
  EngineState,
  CompilerAncestry,
  ElementCallback,
} from '../state/types.mts'

export function compileSelector(
  engine: EngineState,
  expression: string,
  source: string,
  mode: boolean | null,
  callback: boolean | ElementCallback,
  ancestry?: CompilerAncestry,
) {
  const state = {
    engine,
    expression,
    source,
    mode,
    callback,
    ancestry,
  } as CompileState
  state.k = 0
  state.previousErrors = state.engine.errors
  state.pendingTag = ''
  state.firstChildOnly = false
  state.selector = state.expression
  state.shadow =
    state.expression.indexOf(':') >= 0 && state.engine.hasHost(state.expression)
  state.read = state.engine.Config.LEGACY
    ? state.engine.legacyHooks!.read
    : state.mode === false
      ? state.engine.readGuarded
      : state.engine.readDirect
  state.selector = state.engine.selectorComments(state.selector)
  state.ancestry = state.ancestry || { required: [], pending: [], walk: false }
  state.selector = state.engine.normalizeCombinators(state.selector)
  if (state.ancestry.reuse && !state.engine.canReuseAncestor(state.selector)) {
    state.ancestry.reuse = ''
  }
  selector_recursion_label: while (state.selector) {
    ++state.k

    // get namespace prefix if present or get first char of selector
    state.symbol = state.selector.charCodeAt(0)
    // Only ASCII word or universal prefixes can enter the namespace rule.
    {
      classifyNamespace()
    }

    const result = compileToken(state)
    if (result === false) {
      break selector_recursion_label
    }
    if (result !== undefined) {
      return result
    }
    // end of switch symbol

    if (!state.match) {
      state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
      return ''
    }

    // pop last component
    state.selector = state.match.pop()!
  }
  if (state.pendingTag) {
    state.source = state.pendingTag + state.source + '}'
  }
  return state.engine.errors == state.previousErrors ? state.source : ''

  function classifyNamespace() {
    if (
      (state.symbol == 42 /* '*' */ ||
        state.symbol == 95 /* '_' */ ||
        (state.symbol >= 48 /* '0' */ && state.symbol <= 57) /* '9' */ ||
        (state.symbol >= 65 /* 'A' */ && state.symbol <= 90) /* 'Z' */ ||
        (state.symbol >= 97 /* 'a' */ && state.symbol <= 122)) /* 'z' */ &&
      state.engine.STD.apimethods.test(state.selector)
    ) {
      state.symbol = 124 /* '|' */
    }
  }
}
