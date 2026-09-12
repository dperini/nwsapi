import { isParsedPseudoElement } from '../predicate/parsed-pseudo-element.mts'
import { isStringQuote } from '../predicate/string-quote.mts'
import type { EngineState } from '../state/types.mts'
import { validControlPseudo } from './pseudo/control.mts'
import { validShadowPseudo } from './pseudo/shadow.mts'
export function validateLogical(
  engine: EngineState,
  argument: string,
  relative: boolean,
) {
  var previousErrors = engine.errors,
    selectVars = engine.S_VARS,
    matchVars = engine.M_VARS,
    nodeVars = engine.N_VARS,
    list = engine.splitList(argument),
    parsed
  engine.S_VARS = []
  engine.M_VARS = []
  engine.N_VARS = []
  try {
    for (var listLength = list.length, i = 0; i < listLength; ++i) {
      if (!list[i]) {
        engine.emit(engine.qsInvalid)
        return false
      }
      parsed = engine.parse(relative ? '* ' + list[i] : list[i]!, false)
      if (!parsed) {
        return false
      }
      for (var parsedLength = parsed.length, j = 0; j < parsedLength; ++j) {
        engine.compileSelector(parsed[j]!, '', relative, false)
      }
    }
    return engine.errors == previousErrors
  } finally {
    engine.S_VARS = selectVars
    engine.M_VARS = matchVars
    engine.N_VARS = nodeVars
  }
}

export function prepareHas(engine: EngineState, text: string) {
  var i = 0,
    quote = 0,
    bracket = 0,
    code: number,
    logical: ReturnType<typeof engine.matchLogical>,
    items: string[],
    kept: string[],
    item: string | null,
    output = '',
    start = 0
  for (var textLength = text.length; i < textLength; ++i) {
    code = text.charCodeAt(i)
    if (code == 92 /* '\\' */) {
      ++i
      continue
    }
    if (quote) {
      if (code == quote) {
        quote = 0
      }
      continue
    }
    if (code == 34 /* '"' */ || code == 39 /* "'" */) {
      quote = code
      continue
    }
    if (code == 91 /* '[' */) {
      ++bracket
      continue
    }
    if (code == 93 /* ']' */) {
      --bracket
      continue
    }
    if (bracket || code != 58 /* ':' */) {
      continue
    }
    if (
      /^:(?:has\(|:|(?:before|after|first-line|first-letter)(?![-\w]))/i.test(
        text.slice(i),
      )
    ) {
      return null
    }
    {
      expandForgivingHas()
    }
  }
  return output + text.slice(start)

  function expandForgivingHas() {
    if (
      engine.Config.FORGIVING &&
      (logical = engine.matchLogical(text.slice(i), /^:(is|where)\(/i))
    ) {
      items = engine.splitList(logical![2]!)
      kept = []
      for (var itemsLength = items.length, j = 0; j < itemsLength; ++j) {
        item = engine.prepareHas(items[j]!)
        if (item !== null) {
          kept.push(item)
        }
      }
      output +=
        text.slice(start, i) +
        ':' +
        logical![1]! +
        '(' +
        (kept.join(',') || ':not(*)') +
        ')'
      i += logical![0]!.length - 1
      start = i + 1
    }
  }
}

export function readPseudo(engine: EngineState, text: string) {
  var double = text.charAt(1) == ':',
    start = double ? 2 : 1,
    identifier = engine.Patterns.tagName!.exec(text.slice(start)),
    end: number,
    block: NonNullable<ReturnType<typeof engine.matchLogical>>,
    name: string
  if (text.charAt(0) != ':' || !identifier) {
    return null
  }
  name = engine.unescapeIdentifier(identifier[1]!).toLowerCase()
  end = start + identifier[1]!.length
  if (text.charAt(end) == '(') {
    // matchLogical owns nested parentheses, strings, and EOF closure.
    block = engine.matchLogical(':x' + text.slice(end), /^:(x)\(/)!
    return {
      name: name,
      double: double,
      argument: block[2],
      rest: block[3],
    }
  }
  return {
    name: name,
    double: double,
    argument: null,
    rest: text.slice(end),
  }
}

export function isIdent(engine: EngineState, text: string, custom?: boolean) {
  var token = engine.Patterns.tagName!.exec(text)
  return (
    !!token &&
    !token[2] &&
    (!custom ||
      !/^(?:initial|inherit|unset|revert|revert-layer|default)$/i.test(
        engine.unescapeIdentifier(text),
      ))
  )
}

export function hasPseudoElement(engine: EngineState, text: string) {
  var quote = '',
    bracket = 0,
    i = 0,
    char: string,
    pseudo
  for (var textLength = text.length; i < textLength; ++i) {
    char = text.charAt(i)
    if (char == '\\') {
      ++i
      continue
    }
    if (quote) {
      if (char == quote) {
        quote = ''
      }
      continue
    }
    if (isStringQuote(char)) {
      quote = char
      continue
    }
    if (char == '[') {
      ++bracket
      continue
    }
    if (char == ']') {
      --bracket
      continue
    }
    if (bracket || char != ':') {
      continue
    }
    pseudo = engine.readPseudo(text.slice(i))
    if (!pseudo) {
      continue
    }
    if (isParsedPseudoElement(pseudo, engine, text, i)) {
      return true
    }
    if (pseudo.name == 'is' || pseudo.name == 'where') {
      i = text.length - pseudo.rest.length - 1
    }
  }
  return false
}

export function treePseudo(_engine: EngineState, name: string) {
  return /^(?:before|after|marker|placeholder|file-selector-button|details-content|checkmark|picker-icon|picker|backdrop|scroll-marker|scroll-marker-group)$/.test(
    name,
  )
}

export function validPseudoElement(
  engine: EngineState,
  name: string,
  argument: string | null,
): boolean {
  var validateViewTransitionDone = false
  var validateViewTransitionValue!: boolean

  var pieces: string
  if (name === 'part' || name === 'slotted') {
    return validShadowPseudo(engine, name, argument)
  }
  if (name == 'highlight') {
    return (
      argument !== null && (argument == '*' || engine.isIdent(argument, true))
    )
  }
  if (name === 'picker' || name === 'scroll-button') {
    return validControlPseudo(engine, name, argument)
  }
  {
    validateViewTransition()
    if (validateViewTransitionDone) {
      return validateViewTransitionValue
    }
  }
  if (name == 'cue' || name == 'cue-region') {
    return argument === null || validShadowPseudo(engine, 'slotted', argument)
  }
  return (
    argument === null &&
    (engine.treePseudo(name) ||
      /^(?:column|first-line|first-letter|selection|target-text|spelling-error|grammar-error|search-text|view-transition|-webkit-[-a-z0-9]{2,})$/.test(
        name,
      ))
  )

  function validateViewTransition() {
    if (
      /^view-transition-(?:group|image-pair|old|new|group-children)$/.test(name)
    ) {
      if (argument === null) {
        {
          validateViewTransitionValue = false
          validateViewTransitionDone = true
          return
        }
      }
      // Dots delimit class identifiers, except when escaped within an identifier.
      pieces = argument.charAt(0) == '*' ? argument.slice(1) : argument
      if (argument.charAt(0) != '*') {
        var first = engine.Patterns.tagName!.exec(pieces)
        if (!first || !engine.isIdent(first[1]!, true)) {
          {
            validateViewTransitionValue = false
            validateViewTransitionDone = true
            return
          }
        }
        pieces = first[2]!
      }
      while (pieces) {
        if (pieces.charAt(0) != '.') {
          {
            validateViewTransitionValue = false
            validateViewTransitionDone = true
            return
          }
        }
        var part = engine.Patterns.tagName!.exec(pieces.slice(1))
        if (!part || !engine.isIdent(part[1]!, true)) {
          {
            validateViewTransitionValue = false
            validateViewTransitionDone = true
            return
          }
        }
        pieces = part[2]!
      }
      {
        validateViewTransitionValue = true
        validateViewTransitionDone = true
        return
      }
    }
  }
}

export function isPseudoExtension(engine: EngineState, text: string): boolean {
  for (var name in engine.Selectors) {
    if (text.search(engine.Selectors[name]!.Expression) == 0) {
      var token = engine.readPseudo(text)
      return (
        !!token &&
        token.double &&
        !engine.validPseudoElement(token.name, token.argument)
      )
    }
  }
  return false
}
