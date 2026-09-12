import type { CompileState } from './state.d.ts'

export function compileNamespace(
  state: CompileState,
): string | false | undefined {
  state.match = state.selector.match(state.engine.Patterns['namespace']!)
  if (state.match![1] == '*') {
    state.source = 'if(true){' + state.source + '}'
  } else if (!state.match![1]!) {
    state.source = 'if((!e.namespaceURI)){' + state.source + '}'
  } else {
    // DOM selector APIs have no namespace-prefix resolver. An XML
    // xmlns declaration does not declare a CSS selector prefix.
    state.engine.emit("'" + state.expression + "'" + state.engine.qsInvalid)
  }
  return undefined
}
