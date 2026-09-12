import { isStringQuote } from './predicate/string-quote.mts'
import { joinsSelectorTokens } from './joins-selector-tokens.mts'
import type { EngineState } from './state/engine.d.ts'
import type { CompiledResolver } from './types.mts'
export function ancestor(
  engine: EngineState,
  selectors: string,
  element: Element | null,
  callback: ((element: Element) => unknown) | undefined,
) {
  engine.parse(selectors, true)
  if (element && element.ownerDocument !== engine.doc) {
    engine.switchContext(element)
  }
  var previousScope = engine.Snapshot.from
  engine.Snapshot.from = element || engine.doc
  try {
    while (element) {
      if (engine.match(selectors, element, callback)) {
        break
      }
      element = engine.upOf(element)
    }
    return element
  } finally {
    engine.Snapshot.from = previousScope
  }
}

export function match_assert(
  _engine: EngineState,
  f: CompiledResolver[],
  element: Element,
  callback: ((element: Element) => unknown) | undefined,
) {
  for (var i = 0, l = f.length, r = false; l > i; ++i) {
    f[i]!(element, callback, null, false) && (r = true)
  }
  return r
}

export function match_collect(
  engine: EngineState,
  selectors: string[],
  callback: ((element: Element) => unknown) | undefined,
) {
  for (
    var i = 0, l = selectors.length || 0, f = Array<CompiledResolver>(l);
    l > i;
    ++i
  ) {
    f[i] = engine.compile(selectors[i]!, false, callback)!
  }
  return f
}

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

export function parse(
  engine: EngineState,
  selectors: string | string[] | null,
  type: boolean,
): string[] | false | null | undefined {
  var validateSelectorGroupsDone = false
  var validateSelectorGroupsValue!: false | string[] | null | undefined

  var parsed: string

  // arguments validation
  if (arguments.length - 1 === 0) {
    engine.emit(engine.qsNotArgs, TypeError)
    return invalidInput()
  } else if (arguments[1] === '') {
    engine.emit("''" + engine.qsInvalid)
    return invalidInput()
  } else if (/^[.#]?\d/.test(selectors as string)) {
    engine.emit("''" + engine.qsInvalid)
    return invalidInput()
  }

  // input NULL or UNDEFINED
  if (typeof selectors != 'string') {
    selectors = '' + selectors
  }

  selectors = engine.stringContinuations(engine.selectorComments(selectors))
  if (!engine.validBlocks(selectors)) {
    engine.emit("'" + selectors + "'" + engine.qsInvalid)
    return type ? engine.none : false
  }
  // normalize input string
  parsed = selectors
    .replace(/\x00|\\$/g, '\ufffd')
    .replace(engine.REX.CombineWSP, function (part: string) {
      return part[0] == '\\' ? part.replace(/\r\n/g, '\x20') : '\x20'
    })
    .replace(engine.REX.TabCharWSP, '\t')
    .replace(engine.REX.CommaGroup, ',')
    .replace(engine.REX.TrimSpaces, '')

  // parse, validate and split possible compound selectors
  {
    validateSelectorGroups()
    if (validateSelectorGroupsDone) {
      return validateSelectorGroupsValue
    }
  }

  var groups = selectors as unknown as string[] | null
  if (groups && !groups.every(engine.validPseudoSyntax)) {
    engine.emit("'" + parsed + "'" + engine.qsInvalid)
    return type ? engine.none : false
  }
  return groups

  function invalidInput() {
    return engine.Config.VERBOSITY ? undefined : type ? engine.none : false
  }

  function validateSelectorGroups() {
    if (
      (selectors = parsed.match(engine.reValidator)) &&
      (selectors as string[]).join('') == parsed
    ) {
      selectors = engine.splitList(parsed)
      if (parsed[parsed.length - 1] == ',') {
        engine.emit(engine.qsInvalid)
        {
          validateSelectorGroupsValue = engine.Config.VERBOSITY
            ? undefined
            : type
              ? engine.none
              : false
          validateSelectorGroupsDone = true
          return
        }
      }
    } else {
      if (engine.Config.FORGIVING) {
        // forgiving pseudos allow to continue even after parse errors
        if (
          !(
            engine.includes(parsed, ':is(') ||
            engine.includes(parsed, ':where(')
          )
        ) {
          // 'selectors' holds the fragments the validator did match,
          // which read as a mangled selector once joined by String()
          engine.emit("'" + parsed + "'" + engine.qsInvalid)
          {
            validateSelectorGroupsValue = engine.Config.VERBOSITY
              ? undefined
              : type
                ? engine.none
                : false
            validateSelectorGroupsDone = true
            return
          }
        }
        // The validator cannot read this selector, but it holds a
        // forgiving list, which may be where the part it cannot read
        // lives. Hand on the selector itself rather than the fragments the
        // validator did match: compiled, the argument of an :is() or
        // :where() is evaluated inside a try/catch, so the unreadable part
        // drops out and the rest of the selector still applies. Returning
        // the fragments compiled each of them as a selector of its own,
        // which made 'div:not(:is(svg|div))' match every element in the
        // document rather than the divs.
        selectors = engine.splitList(parsed)
      }
    }
  }
}

export function match(
  engine: EngineState,
  selectors: string,
  element: Element,
  callback?: (element: Element) => unknown,
) {
  if (arguments.length - 1 === 0) {
    engine.emit(engine.qsNotArgs, TypeError)
    return false
  }
  var resolver,
    cacheKey = !!callback + ':' + selectors

  if (element && element.ownerDocument !== engine.doc) {
    engine.switchContext(element)
  }

  if (element && (resolver = engine.matchResolvers.get(cacheKey))) {
    return engine.match_assert(resolver, element, callback)
  }

  resolver = engine.match_collect(
    engine.parse(selectors, false) as string[],
    callback,
  )
  engine.matchResolvers.set(cacheKey, resolver)

  return engine.match_assert(resolver, element, callback)
}

export function matchPublic(
  engine: EngineState,
  selectors: string,
  element: Element,
  callback?: (element: Element) => unknown,
) {
  if (arguments.length - 1 === 0) {
    engine.emit(engine.qsNotArgs, TypeError)
    return false
  }
  if (element && element.ownerDocument !== engine.doc) {
    engine.switchContext(element)
  }
  var previousScope = engine.Snapshot.from
  engine.Snapshot.from = element || engine.doc
  try {
    return engine.match(selectors, element, callback)
  } finally {
    engine.Snapshot.from = previousScope
  }
}

export function matchForgiving(
  engine: EngineState,
  list: string[],
  element: Element,
) {
  for (var i = 0, l = list.length; l > i; ++i) {
    try {
      if (engine.match(list[i]!, element)) {
        return true
      }
    } catch (e) {}
  }
  return false
}

export function hasChild(engine: EngineState, element: Element, tag: string) {
  var child = engine.firstOf(element)
  while (child) {
    if (tag == '*' || engine.matchesTag(child, tag)) {
      return true
    }
    child = engine.nextOf(child)
  }
  return false
}
