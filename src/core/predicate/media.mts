import type { EngineState } from '../state/engine.d.ts'
export function isMediaState(
  engine: EngineState,
  media: HTMLMediaElement,
  state: string,
): boolean {
  var native = engine.matchesNative(media, ':' + state, undefined)
  if (native !== undefined) {
    return native
  }
  if (
    media.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
    !/^(audio|video)$/i.test(engine.tagOf(media))
  ) {
    return false
  }
  switch (state) {
    case 'playing':
      return media.paused === false && media.ended !== true
    case 'paused':
      return media.paused === true || media.ended === true
    case 'seeking':
      return media.seeking === true
    case 'muted':
      return media.muted === true
    case 'buffering':
      return (
        engine.isMediaState(media, 'playing') &&
        media.networkState === 2 &&
        media.readyState < 3
      )
    default:
      return false
  }
}
