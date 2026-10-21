import type { EngineState, EngineContext } from '../../state/types.mts'

export const MIN_COLLECTION_SNAPSHOT_LENGTH = 16

export function skipsCollectionSnapshot(
  length: number,
  small: boolean | undefined,
  engine: EngineState,
  context: EngineContext,
) {
  return (
    (length < MIN_COLLECTION_SNAPSHOT_LENGTH && !small) ||
    engine.Config.LEGACY ||
    !engine.primordials.WeakRefCtor ||
    !context.getRootNode
  )
}
