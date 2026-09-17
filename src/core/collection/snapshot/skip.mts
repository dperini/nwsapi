import type { EngineState, EngineContext } from '../../state/types.mts'

export function skipsCollectionSnapshot(
  length: number,
  small: boolean | undefined,
  engine: EngineState,
  context: EngineContext,
) {
  return (
    (length < 16 && !small) ||
    engine.Config.LEGACY ||
    !engine.primordials.WeakRefCtor ||
    !context.getRootNode
  )
}
