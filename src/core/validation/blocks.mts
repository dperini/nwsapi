import type { EngineState } from '../state/engine.d.ts'
export function validBlocks(_engine: EngineState, text: string): boolean {
  var consumeBlockTokenDone = false
  var consumeBlockTokenValue!: boolean

  var stack: string[] = [],
    quote = '',
    char: string,
    i = 0
  for (var textLength = text.length; i < textLength; ++i) {
    char = text.charAt(i)
    if (char == '\\') {
      ++i
      continue
    }
    if (quote) {
      if (char == quote) {
        quote = ''
      } else if (char == '\n' || char == '\r' || char == '\f') {
        return false
      }
    } else {
      consumeBlockToken()
      if (consumeBlockTokenDone) {
        return consumeBlockTokenValue
      }
    }
  }
  // CSS closes unterminated strings and blocks at EOF.
  return true

  function consumeBlockToken() {
    if (char == '"' || char == "'") {
      quote = char
    } else if (char == '(' || char == '[') {
      stack.push(char)
    } else if (char == ')' || char == ']') {
      if (stack.pop() != (char == ')' ? '(' : '[')) {
        {
          consumeBlockTokenValue = false
          consumeBlockTokenDone = true
          return
        }
      }
    } else if (char == '{' || char == '}') {
      {
        consumeBlockTokenValue = false
        consumeBlockTokenDone = true
        return
      }
    }
  }
}
