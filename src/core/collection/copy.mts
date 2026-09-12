import type { EngineState } from '../state/engine.d.ts'
import type { EngineContext } from '../state/types.mts'
export function collectionCopy(
  engine: EngineState,
  nodes: ArrayLike<Element>,
  context: EngineContext,
  snapshot?: ArrayLike<Element>,
  identity?: object | undefined,
) {
  snapshot =
    snapshot ||
    (engine.Config.LEGACY
      ? nodes
      : engine.collectionSnapshot(
          nodes,
          context,
          undefined,
          undefined,
          identity,
        ))
  if (snapshot !== nodes) {
    return (snapshot as Element[]).slice()
  }
  var length = nodes.length,
    i: number,
    // oxlint-disable-next-line unicorn/no-new-array -- dense native collection
    result = new Array(length)
  for (i = 0; i < length; ++i) {
    result[i] = nodes[i]
  }
  return result
}
