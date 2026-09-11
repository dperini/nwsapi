export function isTopLevelCombinator(depth: number, char: string) {
  return !depth && (char == '>' || char == '+' || char == '~')
}
