import type { EngineState, EngineContext } from '../state/types.mts'

export function selectCandidates(
  engine: EngineState,
  token: string,
  context: EngineContext,
  resolver: boolean,
) {
  if (resolver && !engine.Config.LEGACY && !engine.hasExtensions) {
    return engine.hasCandidates(token, context)
  }
  return engine.fetch[token[0]!]!(token.slice(1), context)
}
