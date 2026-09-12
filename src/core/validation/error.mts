import type { EngineState } from '../state/engine.d.ts'
export function emit(
  engine: EngineState,
  message: string,
  proto?: TypeErrorConstructor | undefined,
) {
  var err
  ++engine.errors
  if (engine.Config.VERBOSITY) {
    if (proto) {
      err = new proto(message)
    } else {
      err = new engine.global.DOMException(message, 'SyntaxError')
    }
    throw err
  }
  if (engine.Config.LOGERRORS && console && console.log) {
    console.log(message)
  }
}
