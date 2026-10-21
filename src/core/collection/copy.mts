import { collectionSnapshot, reuseCollectionSnapshot } from './snapshot/get.mts'
import { MIN_COLLECTION_SNAPSHOT_LENGTH } from './snapshot/skip.mts'
import type { EngineState, EngineContext } from '../state/types.mts'

export function collectionCopy(
  engine: EngineState,
  nodes: ArrayLike<Element>,
  context: EngineContext,
  snapshot?: ArrayLike<Element>,
  identity?: object | undefined,
  tagOnly?: boolean | undefined,
) {
  if (!snapshot && !engine.Config.LEGACY) {
    snapshot = reuseCollectionSnapshot(engine, context, identity || nodes)
  }
  if (snapshot && snapshot !== nodes) {
    return (snapshot as Element[]).slice()
  }
  const length = nodes.length
  if (
    !snapshot &&
    !engine.Config.LEGACY &&
    length >= MIN_COLLECTION_SNAPSHOT_LENGTH
  ) {
    snapshot = collectionSnapshot(
      engine,
      nodes,
      context,
      length,
      undefined,
      identity,
      tagOnly,
    )
    if (snapshot !== nodes) {
      return (snapshot as Element[]).slice()
    }
  }
  var i: number,
    // oxlint-disable-next-line unicorn/no-new-array -- dense native collection
    result = new Array(length)
  for (i = 0; i < length; ++i) {
    result[i] = nodes[i]
  }
  return result
}
