import {
  customStateNames,
  selectorArgumentWithoutComments,
  selectorPseudoCandidates,
  statePseudoOccurrences,
  units,
} from '../native-query-state/parser.mts'
import type { NativeQueryBinding } from '../native/types.mts'
import { queryRoot } from './snapshot.mts'
import { containsFormAssociatedCustomElement } from './rows.mts'
import type { QueryContext } from './types.mts'

const HOST_STATE_SELECTOR =
  /:\s*(?:-webkit-full-screen(?:-ancestor)?|active|active-view-transition|autofill|buffering|closed|current|default|focus|focus-visible|focus-within|fullscreen|future|has-slotted|hover|in-range|indeterminate|interest-source|interest-target|invalid|modal|muted|open|out-of-range|past|paused|picture-in-picture|placeholder-shown|playing|popover(?:-open)?|seeking|stalled|state|target-after|target-before|target-current|user-valid|user-invalid|valid|visited|volume-locked|xr-overlay)\b/gi

const DIRECTION_SELECTOR = /:\s*dir\(/gi

function hasSelectorPseudo(selector: string, pattern: RegExp): boolean {
  return (
    selectorPseudoCandidates(selectorArgumentWithoutComments(selector), pattern)
      .length > 0
  )
}

export function requiresSelectorStates(selector: string): boolean {
  return (
    hasSelectorPseudo(selector, HOST_STATE_SELECTOR) ||
    selectorPseudoCandidates(
      selectorArgumentWithoutComments(selector),
      /:\s*(?:current|active-view-transition-type)\s*\(/gi,
    ).length > 0 ||
    statePseudoOccurrences(selectorArgumentWithoutComments(selector)).length > 0
  )
}

function supportsHostDocument(
  document: Document,
  context: QueryContext,
  xmlDocument: boolean,
  binding: NativeQueryBinding,
): boolean {
  return (
    (typeof context.getRootNode === 'function' ||
      binding.legacyReaders !== undefined) &&
    (xmlDocument ||
      (document.contentType === 'text/html' &&
        (document.compatMode === 'CSS1Compat' ||
          document.compatMode === 'BackCompat')) ||
      binding.legacyHtmlDocument === true) &&
    (context === document || context.ownerDocument === document)
  )
}

function requiresJavaScriptResolver(
  binding: NativeQueryBinding,
  selector: string,
  document: Document,
  context: QueryContext,
): boolean {
  return (
    (binding.customBulkHasPlanner === true &&
      binding.routePlanner === true &&
      hasBulkHasPlannerShape(selector) &&
      context === document &&
      document.contentType === 'text/html' &&
      document.compatMode === 'CSS1Compat' &&
      typeof binding.bulkHasPlanner !== 'function') ||
    (binding.customResolvers === true &&
      (binding.usesCustomResolver?.(selector) ?? true))
  )
}

function hasBulkHasPlannerShape(selector: string): boolean {
  const compound = String.raw`\.[A-Za-z_][A-Za-z0-9_-]*(?:\[data-ok=(?:"1"|'1')\])?`
  const match = new RegExp(
    String.raw`^(${compound}):has\((${compound})\)$`,
  ).exec(selector)
  return Boolean(
    match &&
    (match[1]!.includes('[data-ok=') || match[2]!.includes('[data-ok=')),
  )
}

/**
 * The host bridges can invoke the planner callback synchronously for document
 * queries. Keep selectors on JavaScript when callback eligibility cannot be
 * guaranteed from the host context.
 */
export function canBridgeBulkHasPlanner(
  binding: NativeQueryBinding,
  document: Document,
  context: QueryContext,
  selector: string,
): boolean {
  if (
    !binding.customBulkHasPlanner ||
    typeof binding.bulkHasPlanner !== 'function' ||
    !binding.routePlanner ||
    context !== document ||
    document.contentType !== 'text/html' ||
    document.compatMode !== 'CSS1Compat'
  ) {
    return false
  }
  return hasBulkHasPlannerShape(selector)
}

function supportsHostStateSnapshot(
  binding: NativeQueryBinding,
  document: Document,
  root: QueryContext,
  selector: string,
): boolean {
  if (
    hasSelectorPseudo(selector, DIRECTION_SELECTOR) &&
    !binding.directionality
  ) {
    return false
  }
  if (
    hasSelectorPseudo(selector, HOST_STATE_SELECTOR) &&
    !binding.selectorStates
  ) {
    return false
  }
  const registry = document.defaultView?.customElements
  if (
    hasSelectorPseudo(selector, /:\s*(?:valid|invalid)\b/gi) &&
    containsFormAssociatedCustomElement(root, registry, binding)
  ) {
    return false
  }
  const normalized = selectorArgumentWithoutComments(selector)
  const hasState = statePseudoOccurrences(normalized).length > 0
  return (
    !hasState || Boolean(binding.selectorStates && customStateNames(normalized))
  )
}

export function prepareHostQuery(
  binding: NativeQueryBinding,
  document: Document,
  selector: string,
  context: QueryContext,
):
  | {
      source: Uint16Array
      xmlDocument: boolean
      jqueryEnabled: boolean
      notEqualOperator: boolean
      customOperator: string | undefined
      forgiving: boolean
      root: QueryContext
    }
  | undefined {
  const mime = document.contentType
  const xmlDocument = /(?:\/|\+)xml$/.test(mime)
  if (!supportsHostDocument(document, context, xmlDocument, binding)) {
    return undefined
  }
  const root = queryRoot(context, binding)
  if (!root) {
    return undefined
  }
  if (requiresJavaScriptResolver(binding, selector, document, context)) {
    return undefined
  }
  const source = units(selector)
  const jqueryEnabled = binding.jquery === true
  const notEqualOperator =
    typeof binding.notEqualOperator === 'function'
      ? binding.notEqualOperator(selector)
      : binding.notEqualOperator === true
  const customOperator = binding.customOperatorForSelector?.(selector)
  const forgiving = binding.forgiving !== false
  if (
    !binding.supportsHostSelector(
      source,
      jqueryEnabled,
      forgiving,
      binding.cacheLimit,
      binding.cacheBytes,
      notEqualOperator,
      customOperator,
      binding.planCacheId,
      binding.operatorGrammar,
    )
  ) {
    return undefined
  }
  if (!supportsHostStateSnapshot(binding, document, root, selector)) {
    return undefined
  }
  return {
    source,
    xmlDocument,
    jqueryEnabled,
    notEqualOperator,
    customOperator,
    forgiving,
    root,
  }
}
