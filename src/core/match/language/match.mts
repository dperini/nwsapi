import { languageParent } from './parent.mts'
import type { EngineState } from '../../state/types.mts'
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
