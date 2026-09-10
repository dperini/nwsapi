import type { CompileState } from './compile-state.d.ts'
export function positionalFormula(state: CompileState) {
  return state.a >= +1
    ? state.f
      ? 'n>' +
        (state.b - 1) +
        (Math.abs(state.a) != 1 ? '&&' + (state.test as string) : '')
      : 'n==' + state.a
    : state.a <= -1
      ? state.f
        ? 'n<' +
          (state.b + 1) +
          (Math.abs(state.a) != 1 ? '&&' + (state.test as string) : '')
        : 'n==' + state.a
      : state.a === 0
        ? state.n[0]!
          ? 'n==' + state.b
          : 'n>' + (state.b - 1)
        : 'false'
}
