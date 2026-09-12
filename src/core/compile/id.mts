import type { CompileState } from './state.d.ts'

export function compileId(state: CompileState): string | false | undefined {
  state.match = state.selector.match(state.engine.Patterns['id']!)
  state.expr = state.engine
    .escapeIdentifier(state.match![1]!)
    .replace(/\\.|\x22/g, function (part: string) {
      return part == '"' ? '\\"' : part
    })
  state.source =
    'if((' +
    state.read.id('e') +
    '=="' +
    state.expr +
    '")){' +
    state.source +
    '}'
  return undefined
}
