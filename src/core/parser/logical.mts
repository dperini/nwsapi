import type { EngineState } from '../state/engine.d.ts'
export function matchLogical(
  engine: EngineState,
  selector: string,
  prefix?: RegExp,
): [string, string, string, string] | null {
  var chr: number,
    close: number,
    escaped: boolean | undefined,
    depth = 1,
    i: number,
    l: number,
    quote = 0,
    match = selector.match(prefix || engine.REX.LogicalPfx)

  if (!match) {
    return null
  }

  for (i = match[0].length, l = selector.length; l > i; ++i) {
    chr = selector.charCodeAt(i)
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
    } else if (chr == 40 /* '(' */) {
      ++depth
    } else if (chr == 41 /* ')' */ && --depth === 0) {
      break
    }
  }

  // i is the closing parenthesis, or the EOF that stands in for it
  close = l > i ? i + 1 : i

  return [
    selector.slice(0, close),
    match[1]!,
    selector.slice(match[0].length, i).replace(engine.REX.TrimSpaces, ''),
    selector.slice(close),
  ]
}

export function matchNth(engine: EngineState, selector: string) {
  var match = engine.matchLogical(selector, engine.Patterns['treestruct']),
    parts: RegExpExecArray | null
  if (!match) {
    return null
  }
  parts =
    /^(even|odd|[+-]?(?:\d*n(?:[\t\n\f\r ]*[+-][\t\n\f\r ]*\d+)?|\d+))(?:[\t\n\f\r ]+of(?![-\w\u0080-\uFFFF\\])[\t\n\f\r ]*([\s\S]+))?$/i.exec(
      match[2],
    )
  if (!parts) {
    engine.emit("'" + selector + "'" + engine.qsInvalid)
    return null
  }
  return [
    match[0],
    match[1],
    parts[1]!.toLowerCase().replace(/[\t\n\f\r ]/g, ''),
    parts[2]!,
    match[3],
  ] as RegExpMatchArray
}
