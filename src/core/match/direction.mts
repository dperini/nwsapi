import type { EngineState } from '../state/types.mts'
export function isDirection(
  engine: EngineState,
  element: Element,
  direction: string,
) {
  var native = engine.Snapshot.matchesNative(
    element,
    ':dir(' + direction + ')',
    undefined,
  )
  return native === undefined
    ? engine.directionality(element) === direction
    : native
}
