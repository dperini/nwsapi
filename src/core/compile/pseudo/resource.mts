import type { CompileState } from '../state.mts'

export function compilePseudoResource(
  state: CompileState,
): string | false | undefined {
  state.source =
    'if(s.isMediaState(e,' +
    JSON.stringify(state.match![1]!.toLowerCase()) +
    ')){' +
    state.source +
    '}'
  return undefined
}
