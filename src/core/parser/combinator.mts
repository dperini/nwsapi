import { isTopLevelCombinator } from '../predicate/top-level-combinator.mts'
import type { EngineState } from '../state/types.mts'
export function normalizeCombinators(_engine: EngineState, text: string) {
  if (!/[>+~]/.test(text)) {
    return text
  }
  var result = '',
    depth = 0,
    quote = '',
    i = 0,
    char: string
  for (var textLength = text.length; i < textLength; ++i) {
    char = text.charAt(i)
    if (char == '\\') {
      result += char + text.charAt(++i)
      continue
    }
    if (quote) {
      if (char == quote) {
        quote = ''
      }
    } else if (char == '"' || char == "'") {
      quote = char
    } else if (char == '(' || char == '[') {
      ++depth
    } else if (char == ')' || char == ']') {
      --depth
    } else if (isTopLevelCombinator(depth, char)) {
      result = result.replace(/[\t\n\f\r ]+$/, '')
      while (/[\t\n\f\r ]/.test(text.charAt(i + 1)) && i + 1 < text.length) {
        ++i
      }
    }
    result += char
  }
  return result
}
