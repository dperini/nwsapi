import { parsePure, pureCompiler } from './pure.mts'
import { nextCompileIdentifier } from './state.mts'
import type { CompileState } from './state.mts'

export function inlineRelative(state: CompileState, argument: string) {
  if (
    !state.compiler ||
    !pureCompiler(state.engine) ||
    !/^[>+~]/.test(argument)
  ) {
    return false
  }
  const parts = parsePure('*' + argument)
  if (
    !parts ||
    parts.relations.includes(' ') ||
    parts.relations.filter(value => value === '~').length > 1
  ) {
    return false
  }
  const saved = nextCompileIdentifier(state, '_relativeNode')
  const matched = nextCompileIdentifier(state, '_relativeMatch')
  const label = nextCompileIdentifier(state, '_relativeExit')
  let source = matched + '=true;break ' + label + ';'
  for (let i = parts.compounds.length - 1; i > 0; --i) {
    const relation = parts.relations[i - 1]!
    source = state.engine.compileSelector(
      parts.compounds[i]!,
      source,
      state.mode,
      state.callback,
      undefined,
      state.compiler,
    )
    if (relation === '+') {
      source = 'if((e=' + state.read.next('e') + ')){' + source + '}'
    } else {
      const cursor = nextCompileIdentifier(state, '_relativeCursor')
      const first = relation === '>' ? 's.firstOf(e)' : state.read.next('e')
      source =
        'var ' +
        cursor +
        '=' +
        first +
        ';while(' +
        cursor +
        '){e=' +
        cursor +
        ';' +
        source +
        cursor +
        '=' +
        state.read.next(cursor) +
        ';}'
    }
  }
  state.source =
    'var ' +
    saved +
    '=e,' +
    matched +
    '=false;' +
    label +
    ':{' +
    source +
    '}e=' +
    saved +
    ';if(' +
    matched +
    '){' +
    state.source +
    '}'
  return true
}
