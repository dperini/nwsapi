import type { EngineState } from '../state/engine.d.ts'
import type { EngineContext } from '../types.mts'
export function firstCandidates(
  engine: EngineState,
  token: string,
  context: EngineContext,
  name: string,
  api: 'getElementsByTagName' | 'getElementsByClassName',
) {
  return !engine.Config.LEGACY &&
    (engine.HTML_DOCUMENT || token[0] != '*') &&
    (token[0] != '*' || !engine.hasForeignTypes(context)) &&
    (token[0] == '*' || (token[0] == '.' && !/[\t\n\f\r ]/.test(name))) &&
    api in context
    ? context[api]!(name)
    : engine.fetch[token[0]!]!(name, context)
}
