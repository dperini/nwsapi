import { compileAdjacent } from './compile-adjacent.mts'
import { compileAncestor } from './compile-ancestor.mts'
import { compileAttribute } from './compile-attribute.mts'
import { compileChild } from './compile-child.mts'
import { compileClass } from './compile-class.mts'
import { compileExtension } from './compile-extension.mts'
import { compileId } from './compile-id.mts'
import { compileNamespace } from './compile-namespace.mts'
import { compilePseudo } from './compile-pseudo.mts'
import { compileSibling } from './compile-sibling.mts'
import type { CompileState } from './compile-state.d.ts'
import { compileType } from './compile-type.mts'
import { compileUniversal } from './compile-universal.mts'
import { compileUnknown } from './compile-unknown.mts'
export function compileToken(state: CompileState) {
  switch (state.symbol) {
    case 42:
      return compileUniversal(state)
    case 35:
      return compileId(state)
    case 46:
      return compileClass(state)
    case 124:
      return compileNamespace(state)
    case 91:
      return compileAttribute(state)
    case 126:
      return compileSibling(state)
    case 43:
      return compileAdjacent(state)
    case 9:
    case 32:
      return compileAncestor(state)
    case 62:
      return compileChild(state)
    default:
      return compileOtherToken(state)
  }
}

export function compileOtherToken(state: CompileState) {
  if (
    state.symbol === 95 ||
    (state.symbol >= 65 && state.symbol <= 90) ||
    (state.symbol >= 97 && state.symbol <= 122)
  ) {
    return compileType(state)
  }
  if ((state.selector[0] as string) in state.engine.Combinators) {
    return compileExtension(state)
  }
  return state.symbol === 58 ? compilePseudo(state) : compileUnknown(state)
}
