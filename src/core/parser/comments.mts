import { isStringQuote } from '../predicate/string-quote.mts'
import { joinsSelectorTokens } from './token-boundary.mts'
import type { EngineState } from '../state/engine.d.ts'
export function selectorComments(engine: EngineState, text: string) {
  if (!engine.includes(text, '/*')) {
    return text
  }
  var result = '',
    quote = '',
    i = 0,
    end: number,
    c: string,
    before: string,
    after: string,
    escapedEnd = -1,
    hex: RegExpExecArray | null
  while (i < text.length) {
    c = text[i++]!
    if (c == '\\') {
      hex = /^[0-9a-fA-F]{1,6}/.exec(text.slice(i))
      {
        consumeHexEscape()
      }
    } else if (quote) {
      result += c
      if (c == quote) {
        quote = ''
      }
    } else if (isStringQuote(c)) {
      quote = c
      result += c
    } else if (c == '/' && text[i] == '*') {
      consumeComment()
    } else {
      result += c
    }
  }
  return result

  function consumeComment() {
    end = text.indexOf('*/', i + 1)
    i = end < 0 ? text.length : end + 2
    // Adjacent comments represent the same token boundary.
    while (text.slice(i, i + 2) == '/*') {
      end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
    }
    before = result.length == escapedEnd ? 'a' : result[result.length - 1] || ''
    after = text[i] || ''
    if (/:nth-(?:last-)?child\([^()]*[\t\n\f\r ]of$/i.test(result)) {
      result += ' '
    } else if (joinsSelectorTokens(before, after)) {
      // An+B's `of` clause and attribute flags accept separate tokens.
      result +=
        (/^of(?:[\t\n\f\r ]|\/\*)/i.test(text.slice(i)) &&
          /:nth-(?:last-)?child\([^()]*$/i.test(result)) ||
        (/^[is](?:[\t\n\f\r ]|\])/i.test(text.slice(i)) &&
          /\[[^\]]*=[^\]]+$/i.test(result))
          ? ' '
          : '\x01'
    }
  }

  function consumeHexEscape() {
    if (!quote && hex) {
      result += '\\' + ('000000' + hex[0]).slice(-6) + ' '
      i += hex[0].length
      if (/[\t\n\r\f ]/.test(text[i] || '')) {
        if (text[i++] == '\r' && text[i] == '\n') {
          ++i
        }
      }
      escapedEnd = result.length
    } else {
      result += c
      if (i < text.length) {
        result += text[i++]!
      }
    }
  }
}
