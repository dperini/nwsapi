import type { CompileState } from './state.mts'

export function compileType(state: CompileState): string | false | undefined {
  state.match = state.selector.match(state.engine.Patterns['tagName']!)
  state.expr = state.engine.unescapeIdentifier(state.match![1]!)
  state.ancestry.pending[state.ancestry.pending.length] = state.expr
  state.pendingTag = state.engine.HTML_DOCUMENT
    ? 'if(' +
      state.read.tag('e') +
      '==' +
      JSON.stringify(state.engine.asciiLower(state.expr)) +
      '||s.matchesTag(e,' +
      JSON.stringify(state.expr) +
      ')){'
    : 'if((' + state.read.tag('e') + '==' + JSON.stringify(state.expr) + ')){'
  return undefined
}
