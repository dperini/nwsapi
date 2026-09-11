import type { CompileState } from './compile-state.d.ts'

export function compilePseudoLinguistic(
  state: CompileState,
): string | false | undefined {
  state.argument = state.match![2]!.toLowerCase()
  state.source =
    'if(s.isDirection(e,' +
    JSON.stringify(state.argument) +
    ')){' +
    state.source +
    '}'
  return undefined
}
