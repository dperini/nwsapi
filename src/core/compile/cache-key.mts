import type { EngineState, ElementCallback } from '../state/types.mts'

export function compileCacheKey(
  engine: EngineState,
  selector: string,
  mode: boolean | null,
  callback: boolean | ElementCallback,
  relative?: boolean,
  existenceOnly?: boolean,
) {
  var key =
    (mode === true || mode === false || mode === null
      ? engine.compilePrefixes[
          (relative ? 6 : 0) +
            (mode === null ? 4 : mode ? 2 : 0) +
            (callback ? 1 : 0)
        ]
      : (relative ? 'relative:' : 'selector:') +
        mode +
        ':' +
        !!callback +
        ':') + selector
  if (existenceOnly) {
    key = 'exists:' + key
  }
  return key
}
