import type { EngineState } from './state.d.ts'
import type { ElementCallback, EngineContext } from './types.mts'

export function syncLookupContext(engine: EngineState, context: EngineContext) {
  if (
    engine.lastContext !== context ||
    (context !== engine.doc && context.ownerDocument !== engine.doc)
  ) {
    engine.lastContext = engine.switchContext(context)
  }
}

function simpleId(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
) {
  const match = engine.reSimpleId.exec(selectors)
  if (match) {
    return match
  }
  if (engine.Config.LEGACY || selectors.charCodeAt(0) !== 91) {
    return null
  }
  const attribute = /^\[id=(?:"([-\w]+)"|'([-\w]+)'|([_a-zA-Z][-\w]*))\]$/.exec(
    selectors,
  )
  return attribute && engine.isHTML(context.ownerDocument || context)
    ? attribute
    : null
}

export function firstId(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
) {
  if (
    typeof selectors !== 'string' ||
    !selectors ||
    !context.getElementById ||
    !(
      context.nodeType === 9 ||
      (!engine.Config.LEGACY && context.nodeType === 11)
    )
  ) {
    return false
  }
  const match = simpleId(engine, selectors, context)
  if (!match) {
    return false
  }
  syncLookupContext(engine, context)
  return (
    context.getElementById(
      engine.unescapeIdentifier(match[1] || match[2] || match[3]!),
    ) || null
  )
}

function firstCollection(
  engine: EngineState,
  match: RegExpMatchArray,
  context: EngineContext,
) {
  if (match[2]) {
    return context.getElementsByClassName!(match[2])
  }
  if (engine.hasForeignTypes(context)) {
    return engine.byTag(match[1]!, context)
  }
  if (!engine.HTML_DOCUMENT && match[1] !== '*') {
    return engine.byTagNS(context, match[1]!)
  }
  return context.getElementsByTagName!(match[1]!)
}

function firstWithTag(
  engine: EngineState,
  match: RegExpMatchArray,
  collection: ArrayLike<Element>,
) {
  let element = collection[0] || null
  if (match[2] && match[1] && match[1] !== '*') {
    let i = 0
    let length = 0
    while (element && !engine.matchesTag(element, match[1])) {
      // Reading a live collection's length can scan the DOM. Defer it until needed.
      if (i === 0) {
        length = collection.length
      }
      element = ++i < length ? collection[i]! : null
    }
  }
  return element
}

export function firstSimple(
  engine: EngineState,
  selectors: string,
  context: EngineContext,
) {
  if (engine.Config.LEGACY || typeof selectors !== 'string' || !selectors) {
    return false
  }
  const match = /^([a-zA-Z][-\w]*|\*)?(?:\.([_a-zA-Z][-\w]*))?$/.exec(selectors)
  if (
    !match ||
    !(context.nodeType === 9 || context.nodeType === 1) ||
    !context.getElementsByTagName ||
    !context.getElementsByClassName
  ) {
    return false
  }
  syncLookupContext(engine, context)
  const element = match[2] && engine.firstClass(context, match[2], match[1]!)
  return (
    element ||
    firstWithTag(engine, match, firstCollection(engine, match, context))
  )
}

export function notifyFirst(
  element: Element | null,
  callback: ElementCallback,
) {
  if (element && typeof callback === 'function') {
    callback(element)
  }
  return element
}
