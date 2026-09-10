export function isCssWhitespace(code: number) {
  return code === 32 || code === 9 || code === 10 || code === 12 || code === 13
}
