import type { HostStateReaders } from '../native/types.mts'

function isFirstSubmitter(element: Element, form: HTMLFormElement): boolean {
  let first: Element | undefined
  const consider = (candidate: Element) => {
    const control = candidate as HTMLInputElement | HTMLButtonElement
    if (control.form !== form || !/^(?:image|submit)$/.test(control.type)) {
      return
    }
    if (!first || (first.compareDocumentPosition(candidate) & 2) !== 0) {
      first = candidate
    }
  }
  const controls = form.elements
  for (let index = 0, length = controls.length; index < length; index++) {
    consider(controls[index] as Element)
  }
  const descendants = form.getElementsByTagName('input')
  for (let index = 0, length = descendants.length; index < length; index++) {
    if ((descendants[index] as HTMLInputElement).type === 'image') {
      consider(descendants[index]!)
    }
  }
  const documentInputs = form.ownerDocument.getElementsByTagName('input')
  for (let index = 0, length = documentInputs.length; index < length; index++) {
    if ((documentInputs[index] as HTMLInputElement).type === 'image') {
      consider(documentInputs[index]!)
    }
  }
  return first === element
}

function appendRangeState(element: Element, states: string[]): void {
  if (element.localName !== 'input') {
    return
  }
  const input = element as HTMLInputElement
  const type = input.type
  if (
    input.willValidate &&
    !input.formNoValidate &&
    input.validity &&
    /^(?:date|datetime-local|month|number|range|time|week)$/.test(type) &&
    (type === 'range' ||
      element.getAttribute('min') ||
      element.getAttribute('max'))
  ) {
    const out = input.validity.rangeUnderflow || input.validity.rangeOverflow
    states.push(out ? 'out-of-range' : 'in-range')
  }
}

function appendValidityState(
  element: Element,
  readers: HostStateReaders | undefined,
  states: string[],
): void {
  const input = element as HTMLInputElement
  if (element.localName === 'form') {
    const controls = (element as HTMLFormElement).elements
    let formValid = true
    for (let index = 0, length = controls.length; index < length; index++) {
      const control = controls[index] as HTMLInputElement
      if (control.willValidate && control.validity?.valid === false) {
        formValid = false
        break
      }
    }
    states.push(formValid ? 'valid' : 'invalid')
  } else if ('willValidate' in element && input.willValidate) {
    states.push(input.validity?.valid === false ? 'invalid' : 'valid')
  }
  if (element.localName === 'fieldset') {
    const invalid = readers?.first?.(':invalid', element)
    states.push(invalid ? 'invalid' : 'valid')
  }
}

function appendDefaultState(element: Element, states: string[]): void {
  const name = element.localName
  const input = element as HTMLInputElement
  const type = input.type
  if (name === 'option' && (element as HTMLOptionElement).defaultSelected) {
    states.push('default')
    return
  }
  if (
    name === 'input' &&
    /^(?:radio|checkbox)$/.test(type) &&
    input.defaultChecked
  ) {
    states.push('default')
    return
  }
  if (type === 'image' || type === 'submit') {
    const form = (element as HTMLInputElement | HTMLButtonElement).form
    if (form && isFirstSubmitter(element, form)) {
      states.push('default')
    }
  }
}

export function hostInputSelectorStates(
  element: Element,
  readers?: HostStateReaders,
): string[] {
  const states: string[] = []
  appendRangeState(element, states)
  appendValidityState(element, readers, states)
  appendDefaultState(element, states)
  return states
}

export function radioGroupHasChecked(element: Element): boolean {
  const input = element as HTMLInputElement
  if (input.checked) {
    return true
  }
  const name = input.name
  if (!name) {
    return false
  }
  const root = input.getRootNode() as ParentNode
  if (root === input) {
    return false
  }
  const radios = root.querySelectorAll('input[type="radio"]')
  for (let index = 0, length = radios.length; index < length; index++) {
    const candidate = radios[index] as HTMLInputElement
    if (
      candidate.name === name &&
      candidate.form === input.form &&
      candidate.checked
    ) {
      return true
    }
  }
  return false
}
