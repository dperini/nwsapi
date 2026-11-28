import {
  closingParen,
  customStateNames,
  hasAssignedMatch,
  hasSlottedArguments,
  selectorArgumentWithoutComments,
  selectorPseudoCandidates,
  statePseudoOccurrences,
} from './parser.mts'
import { hostInputSelectorStates, radioGroupHasChecked } from './input.mts'
import type { HostStateReaders, NativeMatcher } from '../native/types.mts'

const HTML_NS = 'http://www.w3.org/1999/xhtml'
const BASIC_STATES = [
  'active-view-transition',
  'closed',
  'current',
  'future',
  'interest-source',
  'interest-target',
  'open',
  'past',
  'target-after',
  'target-before',
  'target-current',
  'user-valid',
  'user-invalid',
  'xr-overlay',
]
const MEDIA_STATES = [
  'playing',
  'paused',
  'seeking',
  'buffering',
  'stalled',
  'muted',
  'volume-locked',
]

function appendFocusStates(
  document: Document,
  isFocusable: (element: Element) => Element | false,
  matchesNative: NativeMatcher,
  element: Element,
  states: string[],
): void {
  const active = document.activeElement
  const focused = isFocusable(element) !== false
  if (focused) {
    states.push('focus', 'focus-visible')
  }
  if (focused && active === element) {
    states.push('active')
  }
  const focusWithin =
    !!active &&
    isFocusable(active) !== false &&
    (active === element || element.contains(active))
  if (matchesNative(element, ':focus-within', focusWithin)) {
    states.push('focus-within')
  }
}

function appendBasicStates(
  element: Element,
  matchesNative: NativeMatcher,
  states: string[],
): void {
  if (matchesNative(element, ':hover')) {
    states.push('hover')
  }
  if (
    matchesNative(element, ':autofill') ||
    matchesNative(element, ':-webkit-autofill')
  ) {
    states.push('autofill')
  }
  for (let index = 0, length = BASIC_STATES.length; index < length; index++) {
    const state = BASIC_STATES[index]!
    if (matchesNative(element, `:${state}`)) {
      states.push(state)
    }
  }
}

function appendFunctionalStates(
  selector: string | undefined,
  element: Element,
  matchesNative: NativeMatcher,
  states: string[],
): boolean {
  if (!selector) {
    return true
  }
  const candidates = selectorPseudoCandidates(
    selector,
    /:\s*(current|active-view-transition-type)\s*\(/gi,
  )
  for (let index = 0, length = candidates.length; index < length; index++) {
    const functional = candidates[index]!
    const open = functional.index + functional[0]!.lastIndexOf('(')
    const end = closingParen(selector, open)
    if (end === undefined) {
      return false
    }
    const argument = selectorArgumentWithoutComments(
      selector.slice(open + 1, end),
    ).trim()
    const normalized = `:${functional[1]!.toLowerCase()}(${argument})`
    if (matchesNative(element, normalized)) {
      const state = `functional:${normalized}`
      if (!states.includes(state)) {
        states.push(state)
      }
    }
  }
  return true
}

function appendSlottedStates(
  selector: string | undefined,
  element: Element,
  matchesNative: NativeMatcher,
  states: string[],
): boolean {
  if (!selector) {
    return true
  }
  const occurrences = selectorPseudoCandidates(selector, /:\s*has-slotted\b/gi)
  if (occurrences.length === 0) {
    return true
  }
  const arguments_ = hasSlottedArguments(selector, occurrences)
  if (!arguments_) {
    return false
  }
  if (element.localName !== 'slot' || !('assignedNodes' in element)) {
    return true
  }
  for (let index = 0, length = arguments_.length; index < length; index++) {
    const argument = arguments_[index]!
    const assignedMatch = hasAssignedMatch(
      element as HTMLSlotElement,
      argument,
      matchesNative,
    )
    if (assignedMatch === undefined) {
      return false
    }
    if (assignedMatch) {
      states.push(
        argument.selector === null
          ? 'has-slotted'
          : `has-slotted-selector:${argument.selector}`,
      )
    }
  }
  return true
}

function appendElementStates(
  element: Element,
  readers: HostStateReaders | undefined,
  matchesNative: NativeMatcher,
  states: string[],
): void {
  if ((element as Element & { visited?: boolean }).visited === true) {
    states.push('visited')
  }
  if (matchesNative(element, ':placeholder-shown')) {
    states.push('placeholder-shown')
  }
  if (element.namespaceURI !== HTML_NS) {
    return
  }
  appendHtmlIndeterminateState(element, readers, states)
  appendHtmlPlaceholderState(element, states)
}

function appendHtmlIndeterminateState(
  element: Element,
  readers: HostStateReaders | undefined,
  states: string[],
): void {
  const name = element.localName
  if (name === 'progress' && !element.hasAttribute('value')) {
    states.push('indeterminate')
    return
  }
  if (name !== 'input') {
    return
  }
  const input = element as HTMLInputElement & { switch?: boolean }
  if (
    input.type === 'checkbox' &&
    input.indeterminate &&
    !input.switch &&
    !element.hasAttribute('switch')
  ) {
    states.push('indeterminate')
  } else if (
    input.type === 'radio' &&
    !input.checked &&
    !radioGroupChecked(input, readers)
  ) {
    states.push('indeterminate')
  }
}

function radioGroupChecked(
  input: HTMLInputElement,
  readers: HostStateReaders | undefined,
): boolean {
  return readers?.isRadioGroupChecked
    ? readers.isRadioGroupChecked(input)
    : radioGroupHasChecked(input)
}

function appendHtmlPlaceholderState(element: Element, states: string[]): void {
  if (element.localName !== 'input' && element.localName !== 'textarea') {
    return
  }
  const control = element as HTMLInputElement | HTMLTextAreaElement
  if (
    element.hasAttribute('placeholder') &&
    (element.localName === 'textarea' ||
      /^(?:password|number|search|email|text|tel|url)$/i.test(control.type)) &&
    control.value === ''
  ) {
    states.push('placeholder-shown')
  }
}

function appendReaderStates(
  element: Element,
  readers: HostStateReaders | undefined,
  states: string[],
): void {
  if (readers?.isModal?.(element)) {
    states.push('modal')
  }
  if (readers?.isFullscreen?.(element)) {
    states.push('fullscreen')
  }
  if (readers?.isPictureInPicture?.(element)) {
    states.push('picture-in-picture')
  }
  if (readers?.isPopoverOpen?.(element)) {
    states.push('popover-open')
  }
  appendMediaStates(element, readers, states)
}

function appendMediaStates(
  element: Element,
  readers: HostStateReaders | undefined,
  states: string[],
): void {
  for (let index = 0, length = MEDIA_STATES.length; index < length; index++) {
    const state = MEDIA_STATES[index]!
    if (readers?.isMediaState?.(element as HTMLMediaElement, state)) {
      states.push(state)
    }
  }
}

function appendCustomStates(
  selector: string | undefined,
  element: Element,
  matchesNative: NativeMatcher,
  states: string[],
): boolean {
  if (!selector) {
    return true
  }
  const normalized = selectorArgumentWithoutComments(selector)
  if (statePseudoOccurrences(normalized).length === 0) {
    return true
  }
  const names = customStateNames(normalized)
  if (!names) {
    return false
  }
  for (let index = 0, length = names.length; index < length; index++) {
    const name = names[index]!
    if (matchesNative(element, `:state(${name})`)) {
      states.push(`state:${name}`)
    }
  }
  return true
}

function appendFullscreenStates(
  document: Document,
  element: Element,
  matchesNative: NativeMatcher,
  states: string[],
): void {
  const fullscreen = document.fullscreenElement
  if (fullscreen === element) {
    if (!states.includes('fullscreen')) {
      states.push('fullscreen')
    }
  } else if (fullscreen && element.contains(fullscreen)) {
    states.push('fullscreen-ancestor')
  } else if (matchesNative(element, ':-webkit-full-screen-ancestor')) {
    states.push('fullscreen-ancestor')
  }
}

export function hostSelectorStates(
  document: Document,
  isFocusable: (element: Element) => Element | false,
  matchesNative: NativeMatcher,
  element: Element,
  readers?: HostStateReaders,
  selector?: string,
): string[] | undefined {
  const states: string[] = []
  appendFocusStates(document, isFocusable, matchesNative, element, states)
  appendBasicStates(element, matchesNative, states)
  if (!appendFunctionalStates(selector, element, matchesNative, states)) {
    return undefined
  }
  if (matchesNative(element, ':indeterminate')) {
    states.push('indeterminate')
  }
  if (!appendSlottedStates(selector, element, matchesNative, states)) {
    return undefined
  }
  appendElementStates(element, readers, matchesNative, states)
  appendReaderStates(element, readers, states)
  states.push(...hostInputSelectorStates(element, readers))
  if (!appendCustomStates(selector, element, matchesNative, states)) {
    return undefined
  }
  appendFullscreenStates(document, element, matchesNative, states)
  return states
}
