import { isLogicalCompound } from '../../predicate/logical-compound.mts'
import { isStringQuote } from '../../predicate/string-quote.mts'
import { rejectsPseudoTransition } from './transition.mts'
import type { EngineState } from '../../state/types.mts'
export function validPseudoStates(
  engine: EngineState,
  text: string,
  context: string,
): boolean {
  var token: ReturnType<typeof engine.readPseudo>,
    name: string,
    argument: string | null,
    valid!: boolean
  while (text) {
    token = engine.readPseudo(text)
    if (!token || token.double) {
      return false
    }
    name = token.name
    argument = token.argument
    if (name == 'is' || name == 'where') {
      if (argument === null) {
        return false
      }
      // Invalid branches of forgiving lists do not invalidate the outer selector.
    } else if (name == 'not') {
      if (
        !argument ||
        !engine.splitList(argument).every(function (item) {
          return engine.validPseudoStates(item, context)
        })
      ) {
        return false
      }
    } else {
      {
        validateStateContext()
      }
      if (
        !valid ||
        !engine.validateLogical(
          text.slice(0, text.length - token.rest.length),
          false,
        )
      ) {
        return false
      }
    }
    text = token.rest
  }
  return true

  function validateStateContext() {
    if (context == 'part' || context == 'details-content') {
      valid =
        !/^(?:root|scope|empty|host|host-context|has|has-slotted|nth-.+|(?:first|last|only)-(?:child|of-type))$/.test(
          name,
        )
    } else if (context == 'search-text') {
      valid = name == 'current' && argument === null
    } else if (context.indexOf('view-transition-') == 0) {
      valid = name == 'only-child' && argument === null
    } else {
      valid =
        (engine.treePseudo(context) ||
          context == 'scroll-button' ||
          context.indexOf('-webkit-') == 0) &&
        /^(?:hover|active|focus|focus-visible|focus-within)$/.test(name)
      if (context == 'scroll-button' && /^(?:enabled|disabled)$/.test(name)) {
        valid = true
      }
    }
  }
}

export function validPseudoTail(engine: EngineState, text: string) {
  var token: ReturnType<typeof engine.readPseudo>,
    name: string,
    context = '',
    states = '',
    previous: string
  while (text) {
    token = engine.readPseudo(text)
    if (!token) {
      return false
    }
    name = token.name
    if (
      token.double ||
      (!context && /^(?:before|after|first-line|first-letter)$/.test(name))
    ) {
      if (states && !engine.validPseudoStates(states, context)) {
        return false
      }
      states = ''
      previous = context
      if (rejectsPseudoTransition(previous, name, engine)) {
        return false
      }
      if (!engine.validPseudoElement(name, token.argument)) {
        return false
      }
      context = name
    } else {
      states += text.slice(0, text.length - token.rest.length)
    }
    text = token.rest
  }
  return !states || engine.validPseudoStates(states, context)
}

export function validPseudoSyntax(engine: EngineState, text: string) {
  var quote = '',
    bracket = 0,
    i = 0,
    char: string,
    token: ReturnType<EngineState['readPseudo']>
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
    token = engine.readPseudo(text.slice(i))
    if (!token) {
      continue
    }
    if (
      (token.double ||
        /^(?:before|after|first-line|first-letter)$/.test(token.name)) &&
      !engine.isPseudoExtension(text.slice(i))
    ) {
      return engine.validPseudoTail(text.slice(i))
    }
    i = text.length - token.rest.length - 1
  }
  return true
}

export function hasHost(engine: EngineState, text: string): boolean {
  var testHostTokenDone = false
  var testHostTokenValue!: boolean

  var quote = '',
    bracket = 0,
    i = 0,
    char: string,
    token: ReturnType<EngineState['readPseudo']>
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
    token = engine.readPseudo(text.slice(i))
    {
      testHostToken()
      if (testHostTokenDone) {
        return testHostTokenValue
      }
    }
    if (token) {
      i = text.length - token.rest.length - 1
    }
  }
  return false

  function testHostToken() {
    if (
      token &&
      !token.double &&
      (/^host(?:-context)?$/.test(token.name) ||
        (token.argument !== null && engine.hasHost(token.argument)))
    ) {
      {
        testHostTokenValue = true
        testHostTokenDone = true
        return
      }
    }
  }
}

export function prepareCompound(
  engine: EngineState,
  text: string,
): string | null {
  if (!engine.isCompound(text)) {
    return null
  }
  var quote = '',
    bracket = 0,
    i = 0,
    char: string,
    token: ReturnType<EngineState['readPseudo']>,
    items,
    result = '',
    start = 0
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
    token = engine.readPseudo(text.slice(i))
    if (!token || token.argument === null || !isLogicalCompound(token.name)) {
      continue
    }
    if (!prepareLogicalToken(token)) {
      return null
    }
    i = text.length - token.rest.length - 1
    start = i + 1
  }
  return result + text.slice(start)
  function prepareLogicalToken(token: { name: string; argument: string }) {
    items = engine.splitList(token.argument).map(engine.prepareCompound)
    if (
      token.name == 'not' &&
      items.some(function (item) {
        return item === null
      })
    ) {
      return false
    }
    result +=
      text.slice(start, i) +
      ':' +
      token.name +
      '(' +
      (items
        .filter(function (item) {
          return item !== null
        })
        .join(',') || ':not(*)') +
      ')'

    return true
  }
}

export function shadowRootOf(
  _engine: EngineState,
  scope: Node,
): ShadowRoot | null {
  var root = scope.getRootNode ? scope.getRootNode() : scope
  return root.nodeType == 11 && 'host' in root ? (root as ShadowRoot) : null
}

export function shadowParent(
  engine: EngineState,
  element: Element,
  scope: Node,
) {
  var root = engine.shadowRootOf(scope)
  if (root && root.host === element) {
    return null
  }
  return (
    element.parentElement ||
    (root && element.parentNode === root ? root.host : null)
  )
}

export function isHost(
  engine: EngineState,
  element: Element,
  argument: string | null,
  contextual: boolean,
  scope: Node,
) {
  var root = engine.shadowRootOf(scope),
    current: Element | null = element
  if (!root || root.host !== element) {
    return false
  }
  if (argument === null) {
    return true
  }
  do {
    if (engine.match(argument, current)) {
      return true
    }
    current = contextual ? engine.upOf(current) : null
  } while (current)
  return false
}
