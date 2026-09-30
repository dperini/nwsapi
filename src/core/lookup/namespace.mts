import type { EngineState, EngineContext } from '../state/types.mts'

export function byTagNS(
  engine: EngineState,
  context: EngineContext,
  tag: string,
): Element[] {
  if (context.getElementsByTagNameNS) {
    return engine.collectionCopy(
      context.getElementsByTagNameNS('*', tag),
      context,
    )
  }
  // Fragments and older hosts may have no namespace lookup. A qualified
  // name lookup can omit prefixed elements, so filter the complete walk.
  var candidates = engine.byTag('*', context),
    nodes = [],
    i: number
  if (tag == '*') {
    // The wildcard test is loop-invariant; the copy drops nothing.
    for (
      var candidatesLength = candidates.length, i = 0;
      i < candidatesLength;
      ++i
    ) {
      nodes[nodes.length] = candidates[i]!
    }
    return nodes
  }
  for (
    var candidatesLength = candidates.length, i = 0;
    i < candidatesLength;
    ++i
  ) {
    if (engine.tagOf(candidates[i]!) == tag) {
      nodes[nodes.length] = candidates[i]!
    }
  }
  return nodes
}
