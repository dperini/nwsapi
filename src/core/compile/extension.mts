import type { CompileState } from './state.mts'

export function compileExtension(
  state: CompileState,
): string | false | undefined {
  state.firstChildOnly = false
  state.match![state.match!.length - 1] = '*'
  state.source =
    state.engine.Combinators[state.selector[0]!]!(state.match!) + state.source
  return undefined
}
