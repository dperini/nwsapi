import type { EngineState } from '../state/engine.d.ts'
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
