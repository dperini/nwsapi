import { pureCompiler, pureSelector } from './pure.mts'
import { nextCompileIdentifier } from './state.mts'
import type { CompileState } from './state.mts'

export function inlineLogical(
  state: CompileState,
  argument: string,
  negate: boolean,
) {
  if (!state.compiler || !pureCompiler(state.engine) || argument.length > 512) {
    return false
  }
  const branches = state.engine.splitList(argument)
  if (branches.length > 8 || !branches.every(pureSelector)) {
    return false
  }
  const saved = nextCompileIdentifier(state, '_logicalNode')
  const matched = nextCompileIdentifier(state, '_logicalMatch')
  const label = nextCompileIdentifier(state, '_logicalExit')
  let source = ''
  for (let index = 0, length = branches.length; index < length; ++index) {
    const branch = branches[index]!
    source += state.engine.compileSelector(
      branch,
      matched + '=true;break ' + label + ';',
      state.mode,
      state.callback,
      undefined,
      state.compiler,
    )
  }
  // A successful traversal can leave e on an ancestor when it exits the label.
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
    (negate ? '!' : '') +
    matched +
    '){' +
    state.source +
    '}'
  return true
}
