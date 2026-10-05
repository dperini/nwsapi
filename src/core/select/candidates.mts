import type { EngineState, EngineContext } from '../state/types.mts'

export function selectCandidates(
  engine: EngineState,
  token: string,
  context: EngineContext,
  resolver: boolean,
) {
  if (resolver && !engine.Config.LEGACY && !hasExtensions(engine)) {
    return engine.hasCandidates(token, context)
  }
  return engine.fetch[token[0]!]!(token.slice(1), context)
}

function hasExtensions(engine: EngineState) {
  for (const name in engine.Selectors) {
    if (engine.Selectors[name]) {
      return true
    }
  }
  for (const symbol in engine.Combinators) {
    if (engine.Combinators[symbol]) {
      return true
    }
  }
  return false
}
