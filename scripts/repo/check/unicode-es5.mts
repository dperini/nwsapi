import { parse } from 'acorn'
import {
  arabicLetter,
  leftToRight,
  rightToLeft,
} from '../../../src/external/unicode.js'
import { isMainModule } from '../lib/run-node.mts'

export function checkUnicodeEs5(
  patterns: Readonly<Record<string, RegExp>> = {
    arabicLetter,
    leftToRight,
    rightToLeft,
  },
) {
  for (const [name, pattern] of Object.entries(patterns)) {
    // Direction matching shares these expressions and needs no flags or state.
    if (pattern.flags !== '') {
      throw new Error(`Unicode pattern "${name}" must have no flags`)
    }
    const source = pattern.source
    for (let index = 0; index < source.length; index++) {
      if (source[index] !== '\\') {
        continue
      }
      const escape = source[++index]
      // ES5 can accept these as identity escapes with different semantics.
      if (
        (source[index + 1] === '{' &&
          (escape === 'u' || escape === 'p' || escape === 'P')) ||
        (source[index + 1] === '<' && escape === 'k')
      ) {
        throw new Error(
          `Unicode pattern "${name}" must not use modern regex escapes`,
        )
      }
    }
    try {
      parse(`/${source}/`, { ecmaVersion: 5, sourceType: 'script' })
    } catch {
      throw new Error(
        `Unicode pattern "${name}" must use ES5 regular expression syntax`,
      )
    }
  }
}

if (isMainModule(import.meta.url)) {
  checkUnicodeEs5()
}
