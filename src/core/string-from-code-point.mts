import { isTopLevelCombinator } from './is-top-level-combinator.mts'
import type { EngineState } from './state.d.ts'
import type { EngineContext } from './types.mts'
export function stringFromCodePoint(engine: EngineState, codePoint: number) {
  // out of range, use replacement character
  if (
    codePoint < 1 ||
    codePoint > 0x10ffff ||
    (codePoint > 0xd7ff && codePoint < 0xe000)
  ) {
    return '\ufffd'
  }
  if (codePoint < 0x10000) {
    return engine.primordials.StringFromCharCode(codePoint)
  }
  if (engine.primordials.StringFromCodePoint) {
    return engine.primordials.StringFromCodePoint(codePoint)
  }
  return engine.primordials.StringFromCharCode(
    ((codePoint - 0x10000) >> 0x0a) + 0xd800,
    ((codePoint - 0x10000) % 0x400) + 0xdc00,
  )
}

export function escapeIdentifier(engine: EngineState, str: string) {
  return engine.REX.HasEscapes.test(str)
    ? str.replace(
        engine.REX.FixEscapes,
        function (substring, p1: string, p2: string) {
          // unescaped " or '
          return p2
            ? '\\' + p2
            : // javascript strings are UTF-16 encoded
              engine.REX.HexNumbers.test(p1)
              ? engine.codePointToUTF16(parseInt(p1, 16))
              : // \' \"
                engine.REX.EscOrQuote.test(p1)
                ? substring
                : // \g \h \. \# etc
                  p1
        },
      )
    : str
}

export function unescapeIdentifier(engine: EngineState, str: string) {
  return engine.REX.HasEscapes.test(str)
    ? str.replace(
        engine.REX.FixEscapes,
        function (substring: string, p1: string, p2: string) {
          // unescaped " or '
          return p2
            ? p2
            : // javascript strings are UTF-16 encoded
              engine.REX.HexNumbers.test(p1)
              ? engine.stringFromCodePoint(parseInt(p1, 16))
              : // \' \"
                engine.REX.EscOrQuote.test(p1)
                ? substring
                : // \g \h \. \# etc
                  p1
        },
      )
    : str
}

export function splitList(engine: EngineState, text: string) {
  var chr: number,
    depth = 0,
    escaped: boolean | undefined,
    i = 0,
    l = text.length,
    quote = 0,
    start = 0,
    list = []

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
    } else if (chr == 44 /* ',' */ && depth === 0) {
      list[list.length] = text
        .slice(start, i)
        .replace(engine.REX.TrimSpaces, '')
      start = i + 1
    }
  }
  list[list.length] = text.slice(start).replace(engine.REX.TrimSpaces, '')
  return list
}

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

export function normalizeCombinators(_engine: EngineState, text: string) {
  if (!/[>+~]/.test(text)) {
    return text
  }
  var result = '',
    depth = 0,
    quote = '',
    i = 0,
    char: string
  for (; i < text.length; ++i) {
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

export function byIdRaw(
  engine: EngineState,
  id: string,
  context: EngineContext,
  from?: Element,
): Element[] {
  var node: EngineContext | null = context,
    nodes: Element[] = [],
    next

  if (engine.Config.LEGACY) {
    return engine.legacyHooks!.byIdRaw(id, context, from)
  }

  next = from || node.firstElementChild
  while ((node = next)) {
    ;(node as Element).id == id && (nodes[nodes.length] = node as Element)
    if (
      (next = node.firstElementChild || (node as Element).nextElementSibling)
    ) {
      continue
    }
    while (!next && (node = node.parentElement) && node !== context) {
      next = (node as Element).nextElementSibling
    }
  }
  return nodes
}

export function byId(
  engine: EngineState,
  id: string,
  context: EngineContext,
): Element[] {
  var findIdCandidatesDone = false
  var findIdCandidatesValue!: Element[]

  var e,
    i: number,
    l: number,
    nodes,
    lookupRoot,
    api = engine.method['#']

  // duplicates id allowed
  {
    findIdCandidates()
    if (findIdCandidatesDone) {
      return findIdCandidatesValue
    }
  }

  // Without document.all — jsdom does not implement it — every '#id'
  // used to walk the whole subtree, which measures 2.5ms against 43ns
  // for getElementById on a 6300-element document. getElementById cannot
  // answer on its own, because a document may carry the same id more
  // than once and all of them match, but it does settle two things in
  // constant time: whether the id exists anywhere, and where the first
  // one is, since it returns the first in tree order and any duplicate
  // has to follow it.
  // A connected element may belong to a shadow tree. Only its actual
  // document root can prove absence through the document's ID map.
  lookupRoot =
    context.nodeType == 9
      ? context
      : context.getRootNode
        ? context.getRootNode()
        : null
  if (lookupRoot && lookupRoot.nodeType == 9) {
    e = (lookupRoot as Document).getElementById(id)
    if (!e) {
      return engine.none
    }
    if (context.nodeType == 9) {
      return engine.byIdRaw(id, context, e)
    }
  }

  return engine.byIdRaw(id, context)

  function findIdCandidates() {
    if (engine.Config.IDS_DUPES === false) {
      if (api in context) {
        {
          findIdCandidatesValue = (e = context[api]!(id)) ? [e] : engine.none
          findIdCandidatesDone = true
          return
        }
      }
    } else {
      if ('all' in context) {
        if (
          (e = (
            context.all as HTMLAllCollection &
              Record<string, Element | HTMLCollectionOf<Element> | number>
          )[id])
        ) {
          if ((e as Element).nodeType == 1) {
            {
              findIdCandidatesValue =
                engine.attrOf(e as Element, 'id') != id ? [] : [e as Element]
              findIdCandidatesDone = true
              return
            }
          } else if (id == 'length') {
            {
              findIdCandidatesValue = (e = context[api]!(id))
                ? [e]
                : engine.none
              findIdCandidatesDone = true
              return
            }
          }
          for (
            i = 0, l = (e as HTMLCollectionOf<Element>).length, nodes = [];
            l > i;
            ++i
          ) {
            if (
              (e as ArrayLike<Element>)[i]! &&
              (e as ArrayLike<Element>)[i]!.nodeType == 1 &&
              engine.idOf((e as ArrayLike<Element>)[i]!) == id
            ) {
              nodes[nodes.length] = (e as ArrayLike<Element>)[i]!
            }
          }
          {
            findIdCandidatesValue = nodes
            findIdCandidatesDone = true
            return
          }
        } else {
          {
            findIdCandidatesValue = engine.none
            findIdCandidatesDone = true
            return
          }
        }
      }
    }
  }
}

export function byTagNS(
  engine: EngineState,
  context: EngineContext,
  tag: string,
): Element[] {
  if (context.getElementsByTagNameNS) {
    return engine.collectionCopy(
      context.getElementsByTagNameNS('*', tag),
      context,
    )
  }
  // Fragments and older hosts may have no namespace lookup. A qualified
  // name lookup can omit prefixed elements, so filter the complete walk.
  var candidates = engine.byTag('*', context),
    nodes = [],
    i: number
  for (i = 0; i < candidates.length; ++i) {
    if (tag == '*' || engine.tagOf(candidates[i]!) == tag) {
      nodes[nodes.length] = candidates[i]!
    }
  }
  return nodes
}
