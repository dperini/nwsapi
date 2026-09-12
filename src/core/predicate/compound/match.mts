import { isCompoundSeparator } from './separator.mts'
import type { EngineState } from '../../state/engine.d.ts'
export function isCompound(
  _engine: EngineState,
  text: string,
  siblings?: boolean,
) {
  var chr: number,
    depth = 0,
    escaped: boolean | undefined,
    i = 0,
    l = text.length,
    quote = 0

  for (; l > i; ++i) {
    chr = text.charCodeAt(i)
    if (escaped) {
      escaped = false
      continue
    }
    if (chr == 92 /* '\\' */) {
      escaped = true
    } else if (quote) {
      if (chr == quote) {
        quote = 0
      }
    } else if (chr == 34 /* '"' */ || chr == 39 /* "'" */) {
      quote = chr
    } else if (chr == 40 /* '(' */ || chr == 91 /* '[' */) {
      ++depth
    } else if (chr == 41 /* ')' */ || chr == 93 /* ']' */) {
      --depth
    } else if (isCompoundSeparator(depth, chr, siblings) /* '\r' */) {
      return false
    }
  }

  return l > 0
}
