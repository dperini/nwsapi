import type { EngineState } from '../state/types.mts'

const identifier = '[_a-zA-Z][-\\w]*'
const attribute =
  '\\[' +
  identifier +
  '(?:[~|^$*]?=(?:"[^"\\\\\\r\\n]*"|\'[^\'\\\\\\r\\n]*\'|' +
  identifier +
  '))?\\]'
const token = new RegExp(
  '^(?:[.#]' + identifier + '|' + attribute + '|[a-zA-Z][-\\w]*|\\*)',
)
const separator = /^[\t\n\f\r ]*([>+~]?)[\t\n\f\r ]*/

export interface PureChain {
  compounds: string[]
  relations: string[]
}

export function pureCompiler(engine: EngineState) {
  return !engine.Config.LEGACY && engine.selectorGeneration === 0
}

export function parsePure(selector: string): PureChain | null {
  if (!selector || selector.length > 512) {
    return null
  }
  const compounds: string[] = []
  const relations: string[] = []
  let current = ''
  while (selector) {
    const match = token.exec(selector)
    if (match) {
      if (current && /^[a-zA-Z*]/.test(match[0])) {
        return null
      }
      current += match[0]
      selector = selector.slice(match[0].length)
      continue
    }
    const between = separator.exec(selector)!
    if (!current || !between[0]) {
      return null
    }
    compounds.push(current)
    relations.push(between[1] || ' ')
    current = ''
    selector = selector.slice(between[0].length)
  }
  if (!current) {
    return null
  }
  compounds.push(current)
  return { compounds, relations }
}

export function pureCompound(selector: string) {
  const parsed = parsePure(selector)
  return !!parsed && parsed.compounds.length === 1
}

export function pureSelector(selector: string) {
  return parsePure(selector) !== null
}
