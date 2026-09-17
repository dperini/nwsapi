import type { EngineState } from '../state/types.mts'
export function stringFromCodePoint(engine: EngineState, codePoint: number) {
  // out of range, use replacement character
  if (
    codePoint < 1 ||
    codePoint > 0x10ffff ||
    (codePoint > 0xd7ff && codePoint < 0xe000)
  ) {
    return '\ufffd'
  }
  if (codePoint < 0x10000) {
    return engine.primordials.StringFromCharCode(codePoint)
  }
  if (engine.primordials.StringFromCodePoint) {
    return engine.primordials.StringFromCodePoint(codePoint)
  }
  return engine.primordials.StringFromCharCode(
    ((codePoint - 0x10000) >> 0x0a) + 0xd800,
    ((codePoint - 0x10000) % 0x400) + 0xdc00,
  )
}

export function escapeIdentifier(engine: EngineState, str: string) {
  return engine.REX.HasEscapes.test(str)
    ? str.replace(
        engine.REX.FixEscapes,
        function (substring, p1: string, p2: string) {
          // unescaped " or '
          return p2
            ? '\\' + p2
            : // javascript strings are UTF-16 encoded
              engine.REX.HexNumbers.test(p1)
              ? engine.codePointToUTF16(parseInt(p1, 16))
              : // \' \"
                engine.REX.EscOrQuote.test(p1)
                ? substring
                : // \g \h \. \# etc
                  p1
        },
      )
    : str
}

export function unescapeIdentifier(engine: EngineState, str: string) {
  return engine.REX.HasEscapes.test(str)
    ? str.replace(
        engine.REX.FixEscapes,
        function (substring: string, p1: string, p2: string) {
          // unescaped " or '
          return p2
            ? p2
            : // javascript strings are UTF-16 encoded
              engine.REX.HexNumbers.test(p1)
              ? engine.stringFromCodePoint(parseInt(p1, 16))
              : // \' \"
                engine.REX.EscOrQuote.test(p1)
                ? substring
                : // \g \h \. \# etc
                  p1
        },
      )
    : str
}
