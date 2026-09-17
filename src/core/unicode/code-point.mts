import type { EngineState } from '../state/types.mts'
export function codePointToUTF16(_engine: EngineState, codePoint: number) {
  // out of range, use replacement character
  if (
    codePoint < 1 ||
    codePoint > 0x10ffff ||
    (codePoint > 0xd7ff && codePoint < 0xe000)
  ) {
    return '\\ufffd'
  }
  // javascript strings are UTF-16 encoded
  if (codePoint < 0x10000) {
    var lowHex = '000' + codePoint.toString(16)
    return '\\u' + lowHex.substr(lowHex.length - 4)
  }
  // supplementary high + low surrogates
  return (
    '\\u' +
    (((codePoint - 0x10000) >> 0x0a) + 0xd800).toString(16) +
    '\\u' +
    (((codePoint - 0x10000) % 0x400) + 0xdc00).toString(16)
  )
}
