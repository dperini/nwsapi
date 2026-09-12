import type { EngineState } from '../state/types.mts'
export function optimize(
  _engine: EngineState,
  selector: string,
  token: RegExpMatchArray,
) {
  var index = token.index!,
    length = token[1]!.length + token[2]!.length
  return (
    selector.slice(0, index) +
    (' >+~'.indexOf(selector.charAt(index - 1)) > -1
      ? ':['.indexOf(selector.charAt(index + length + 1)) > -1
        ? '*'
        : ''
      : '') +
    selector.slice(index + length - (token[1] == '*' ? 1 : 0))
  )
}
