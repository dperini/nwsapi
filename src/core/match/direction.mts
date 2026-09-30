import type { EngineState } from '../state/types.mts'

// The direction arrives as a compile-time constant of the selector,
// so its probe selector is remembered instead of being concatenated
// again for every element tested.
var directionProbes: Record<string, string> | null = null

export function isDirection(
  engine: EngineState,
  element: Element,
  direction: string,
) {
  directionProbes ||
    (directionProbes = Object.create(null))
  var probe =
    directionProbes[direction] ||
    (directionProbes[direction] = ':dir(' + direction + ')')
  var native = engine.Snapshot.matchesNative(element, probe, undefined)
  return native === undefined
    ? engine.directionality(element) === direction
    : native
}
