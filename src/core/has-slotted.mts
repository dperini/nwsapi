import { languageParent } from './language-parent.mts'
import type { EngineState } from './state/engine.d.ts'
export function hasSlotted(
  engine: EngineState,
  element: Element,
  argument: string | null,
) {
  if (
    element.namespaceURI != 'http://www.w3.org/1999/xhtml' ||
    element.localName != 'slot'
  ) {
    return false
  }
  var slot = element as HTMLSlotElement
  if (typeof slot.assignedNodes != 'function') {
    return false
  }
  var nodes = slot.assignedNodes({ flatten: true })
  if (argument === null) {
    return nodes.length > 0
  }
  for (var i = 0, nodesLength = nodes.length; i < nodesLength; ++i) {
    if (
      nodes[i]!.nodeType == 1 &&
      engine.match(argument, nodes[i] as Element)
    ) {
      return true
    }
  }
  return false
}

export function isDirection(
  engine: EngineState,
  element: Element,
  direction: string,
) {
  var native = engine.Snapshot.matchesNative(
    element,
    ':dir(' + direction + ')',
    undefined,
  )
  return native === undefined
    ? engine.directionality(element) === direction
    : native
}

export function isLanguage(
  engine: EngineState,
  element: Element,
  range: string,
) {
  var current: Element | null = element,
    language: string | null = null,
    parts,
    wanted,
    i: number,
    j: number
  {
    language = findInheritedLanguage()
  }
  if (!language) {
    return range === ''
  }
  if (
    !/^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/i.test(language) ||
    !/^(?:[a-z]{1,8}|\*)(?:-(?:[a-z0-9]{1,8}|\*))*$/i.test(range)
  ) {
    return false
  }
  parts = language.toLowerCase().split('-')
  wanted = range.toLowerCase().split('-')
  if (wanted[0] != '*' && wanted[0] != parts[0]) {
    return false
  }
  i = 1
  j = 1
  while (i < wanted.length) {
    if (wanted[i] == '*') {
      ++i
      continue
    }
    if (j >= parts.length) {
      return false
    }
    if (wanted[i] == parts[j]) {
      ++i
      ++j
      continue
    }
    if (parts[j]!.length == 1) {
      return false
    }
    ++j
  }
  return true

  function findInheritedLanguage() {
    while (current) {
      language =
        current.getAttributeNS &&
        current.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang')
      if (
        language == null &&
        current.namespaceURI == 'http://www.w3.org/1999/xhtml'
      ) {
        language = engine.attrOf(current, 'lang')
      }
      if (language !== null) {
        break
      }
      current = languageParent(engine, current)
    }
    return language
  }
}

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
