import { isStringQuote } from '../predicate/string-quote.mts'
import type { EngineState } from '../state/engine.d.ts'
export function stringContinuations(_engine: EngineState, selectors: string) {
  if (!/[\r\n\f]/.test(selectors)) {
    return selectors
  }
  var i = 0,
    j: number,
    c: string,
    next: string,
    quote = '',
    result = '',
    length = selectors.length
  while (i < length) {
    c = selectors[i++]!
    if (c == '\\' && i == length && quote) {
      break
    }
    if (c == '\\' && i < length) {
      next = selectors[i]!
      if (quote && /[\r\n\f]/.test(next)) {
        ++i
        if (next == '\r' && selectors[i] == '\n') {
          ++i
        }
        continue
      }
      if (quote && /[0-9a-f]/i.test(next)) {
        consumeStringEscape()
        continue
      }
      result += c + selectors[i++]!
      continue
    }
    updateStringQuote()
    result += c
  }
  // EOF closes a string. Keep its trailing whitespace inside that string
  // so selector trimming cannot erase a bad newline or a literal space.
  return result + quote

  function updateStringQuote() {
    if (c == quote) {
      quote = ''
    } else if (!quote && isStringQuote(c)) {
      quote = c
    }
  }

  function consumeStringEscape() {
    j = i
    while (i < length && i - j < 6 && /[0-9a-f]/i.test(selectors[i]!)) {
      ++i
    }
    result += '\\' + ('000000' + selectors.slice(j, i)).slice(-6)
    {
      consumeContinuation()
    }
  }

  function consumeContinuation() {
    if (/[\x20\t\r\n\f]/.test(selectors[i]! || '')) {
      next = selectors[i++]!
      if (next == '\r' && selectors[i] == '\n') {
        ++i
      }
    }
  }
}
