import { units } from '../native-query-state/parser.mts'
import type { HostNode, NativeQueryBinding } from '../native/types.mts'
import type { QueryContext, SnapshotOptions } from './types.mts'

const HTML_NS = 'http://www.w3.org/1999/xhtml'
const htmlName = /^[a-z][a-z0-9_-]*$/
const foreignName = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/

const XML_NAME_START_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x41, 0x5a],
  [0x61, 0x7a],
  [0xc0, 0xd6],
  [0xd8, 0xf6],
  [0xf8, 0x2ff],
  [0x370, 0x37d],
  [0x37f, 0x1fff],
  [0x200c, 0x200d],
  [0x2070, 0x218f],
  [0x2c00, 0x2fef],
  [0x3001, 0xd7ff],
  [0xf900, 0xfdcf],
  [0xfdf0, 0xfffd],
  [0x10000, 0xeffff],
]

function isXmlNameStart(codePoint: number): boolean {
  if (codePoint === 0x3a || codePoint === 0x5f) {
    return true
  }
  for (
    let index = 0, length = XML_NAME_START_RANGES.length;
    index < length;
    index++
  ) {
    const [start, end] = XML_NAME_START_RANGES[index]!
    if (codePoint >= start && codePoint <= end) {
      return true
    }
  }
  return false
}

function isXmlNameContinuation(codePoint: number): boolean {
  return (
    isXmlNameStart(codePoint) ||
    codePoint === 0x2d ||
    codePoint === 0x2e ||
    (codePoint >= 0x30 && codePoint <= 0x39) ||
    codePoint === 0xb7 ||
    (codePoint >= 0x300 && codePoint <= 0x36f) ||
    (codePoint >= 0x203f && codePoint <= 0x2040)
  )
}

function isXmlName(name: string): boolean {
  if (foreignName.test(name)) {
    return true
  }
  let offset = 0
  while (offset < name.length) {
    const codePoint = name.codePointAt(offset)!
    if (
      (offset === 0 && !isXmlNameStart(codePoint)) ||
      (offset > 0 && !isXmlNameContinuation(codePoint))
    ) {
      return false
    }
    offset += codePoint > 0xffff ? 2 : 1
  }
  return offset > 0
}

function elementTagName(element: Element, binding: NativeQueryBinding): string {
  return binding.legacyReaders?.tagOf(element) ?? element.localName
}

function attributeNamespace(
  element: Element,
  name: string,
): string | undefined {
  const attrs = element.attributes
  for (let index = 0, length = attrs.length; index < length; index++) {
    const attr = attrs.item(index)
    if (attr?.name === name && attr.namespaceURI) {
      return attr.namespaceURI
    }
  }
  return undefined
}

function isValidElementName(
  element: Element,
  html: boolean,
  binding: NativeQueryBinding,
): boolean {
  const name = elementTagName(element, binding)
  if (html) {
    return !element.prefix && htmlName.test(name)
  }
  return (
    isXmlName(name) && (element.prefix === null || isXmlName(element.prefix))
  )
}

function legacyHostAttributes(
  element: Element,
  html: boolean,
  binding: NativeQueryBinding,
): NonNullable<HostNode['attrs']> | undefined {
  const attrs: NonNullable<HostNode['attrs']> = []
  const names = new Set<string>()
  const readers = binding.legacyReaders!
  const legacyNames = readers.attrNamesOf(element)
  for (let index = 0, length = legacyNames.length; index < length; index++) {
    const name = legacyNames[index]!
    const key = html ? name.toLowerCase() : name
    const value = readers.attrOf(element, name)
    if (
      value === null ||
      names.has(key) ||
      (html && key !== name.toLowerCase())
    ) {
      return undefined
    }
    names.add(key)
    const namespace = attributeNamespace(element, name)
    attrs.push({
      ...(namespace ? { namespace: units(namespace) } : {}),
      name: units(key),
      value: units(value),
    })
  }
  return attrs
}

function modernHostAttributes(
  element: Element,
  html: boolean,
): NonNullable<HostNode['attrs']> | undefined {
  const attrs: NonNullable<HostNode['attrs']> = []
  const names = new Set<string>()
  const attributes = element.attributes
  for (let index = 0, length = attributes.length; index < length; index++) {
    const attr = attributes.item(index)!
    const key = html ? attr.name.toLowerCase() : attr.name
    if (
      names.has(key) ||
      (html && key !== attr.name) ||
      (attr.namespaceURI !== null && (key === 'id' || key === 'class'))
    ) {
      return undefined
    }
    names.add(key)
    attrs.push({
      ...(attr.namespaceURI === null
        ? {}
        : { namespace: units(attr.namespaceURI) }),
      name: units(attr.name),
      value: units(attr.value),
    })
  }
  return attrs
}

function hostAttributes(
  element: Element,
  html: boolean,
  binding: NativeQueryBinding,
): NonNullable<HostNode['attrs']> | undefined {
  return binding.legacyReaders
    ? legacyHostAttributes(element, html, binding)
    : modernHostAttributes(element, html)
}

function hasTextChild(element: Element): boolean {
  for (let child = element.firstChild; child; child = child.nextSibling) {
    if (
      (child.nodeType === 3 || child.nodeType === 4) &&
      (child.nodeValue?.length ?? 0) > 0
    ) {
      return true
    }
  }
  return false
}

export function elementChildren(node: Node): Element[] {
  const result: Element[] = []
  const children = node.childNodes
  for (let index = children.length - 1; index >= 0; index--) {
    const child = children.item(index)
    if (child?.nodeType === 1) {
      result.push(child as Element)
    }
  }
  return result
}

function isDefinedElement(
  element: Element,
  registry: CustomElementRegistry | undefined,
  binding: NativeQueryBinding,
  tagName: string,
): boolean {
  const customizedName = binding.legacyReaders
    ? binding.legacyReaders.attrOf(element, 'is')
    : element.getAttribute('is')
  if (!tagName.includes('-') && !customizedName) {
    return true
  }
  const constructor = registry?.get(customizedName || tagName)
  return Boolean(constructor && element instanceof constructor)
}

function nonElementRow(
  node: QueryContext,
  parent: number | undefined,
): HostNode {
  if (node.nodeType === 9) {
    return { document: true }
  }
  return {
    ...(parent === undefined ? {} : { parent }),
    shadowRoot: 'host' in node,
  }
}

function elementRow(
  element: Element,
  parent: number | undefined,
  options: SnapshotOptions,
  tagName: string,
  html: boolean,
  attrs: NonNullable<HostNode['attrs']>,
  states: string[] | undefined,
): HostNode {
  const result: HostNode = {
    ...(parent === undefined ? {} : { parent }),
    tag: element.prefix ? element.prefix + ':' + tagName : tagName,
    attrs,
    hasTextChild: hasTextChild(element),
    hasChild: element.firstChild !== null,
    hasOffsetDimensions: Boolean(
      (element as HTMLElement).offsetWidth ||
      (element as HTMLElement).offsetHeight,
    ),
    target:
      options.targetId !== undefined &&
      (options.binding.legacyReaders
        ? options.binding.legacyReaders.attrOf(element, 'id')
        : element.id) === options.targetId,
  }
  if (!html) {
    result.namespace = element.namespaceURI ?? ''
  } else {
    result.defined = isDefinedElement(
      element,
      options.registry,
      options.binding,
      tagName,
    )
  }
  if ('checked' in element) {
    result.checked = Boolean((element as HTMLInputElement).checked)
  }
  if ('selected' in element) {
    result.selected = Boolean((element as HTMLOptionElement).selected)
  }
  if (options.binding.directionality) {
    result.directionRtl = options.binding.directionality(element) === 'rtl'
  }
  if (states) {
    result.states = states
  }
  return result
}

export function row(
  node: QueryContext,
  parent: number | undefined,
  options: SnapshotOptions,
): HostNode | undefined {
  if (node.nodeType !== 1) {
    return nonElementRow(node, parent)
  }
  const element = node as Element
  const legacy = options.binding.legacyReaders
  const namespace = element.namespaceURI
  const html =
    !options.xmlDocument &&
    (namespace === HTML_NS || (legacy !== undefined && !namespace))
  const tagName = elementTagName(element, options.binding)
  if (!isValidElementName(element, html, options.binding)) {
    return undefined
  }
  const attrs = hostAttributes(element, html, options.binding)
  if (!attrs) {
    return undefined
  }
  const states = options.selectorStatesRequired
    ? options.binding.selectorStates?.(element, options.selector)
    : undefined
  if (
    options.selectorStatesRequired &&
    options.binding.selectorStates &&
    states === undefined
  ) {
    return undefined
  }
  return elementRow(element, parent, options, tagName, html, attrs, states)
}

function isFormAssociatedCustomElement(
  element: Element,
  registry: CustomElementRegistry | undefined,
  binding: NativeQueryBinding,
): boolean {
  const tagName = elementTagName(element, binding)
  const name = tagName.includes('-')
    ? tagName
    : binding.legacyReaders
      ? binding.legacyReaders.attrOf(element, 'is')
      : element.getAttribute('is')
  if (!name) {
    return false
  }
  const definition = registry?.get(name) as
    | (CustomElementConstructor & { formAssociated?: boolean })
    | undefined
  return definition?.formAssociated === true
}

export function containsFormAssociatedCustomElement(
  context: QueryContext,
  registry: CustomElementRegistry | undefined,
  binding: NativeQueryBinding,
): boolean {
  return (
    containsFormAssociatedDescendant(context, registry, binding) ||
    (context.nodeType === 11 &&
      'host' in context &&
      shadowAncestorsContainFormAssociated(
        context as ShadowRoot,
        registry,
        binding,
      ))
  )
}

function containsFormAssociatedDescendant(
  context: QueryContext,
  registry: CustomElementRegistry | undefined,
  binding: NativeQueryBinding,
): boolean {
  const stack: QueryContext[] = [context]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (
      current.nodeType === 1 &&
      isFormAssociatedCustomElement(current as Element, registry, binding)
    ) {
      return true
    }
    const children = elementChildren(current)
    for (let index = 0, length = children.length; index < length; index++) {
      stack.push(children[index]!)
    }
    if (current.nodeType === 1) {
      const shadowRoot = (current as Element).shadowRoot
      if (shadowRoot) {
        stack.push(shadowRoot)
      }
    }
  }
  return false
}

function shadowIncludingParent(
  element: Element,
  binding: NativeQueryBinding,
): Element | null {
  const parent = binding.legacyReaders
    ? binding.legacyReaders.upOf(element)
    : element.parentElement
  if (parent) {
    return parent
  }
  const root = element.getRootNode()
  return root.nodeType === 11 && 'host' in root
    ? (root as ShadowRoot).host
    : null
}

function shadowAncestorsContainFormAssociated(
  root: ShadowRoot,
  registry: CustomElementRegistry | undefined,
  binding: NativeQueryBinding,
): boolean {
  const visited = new Set<Element>()
  let ancestor: Element | null = root.host
  while (ancestor && !visited.has(ancestor)) {
    visited.add(ancestor)
    if (isFormAssociatedCustomElement(ancestor, registry, binding)) {
      return true
    }
    ancestor = shadowIncludingParent(ancestor, binding)
  }
  return false
}
