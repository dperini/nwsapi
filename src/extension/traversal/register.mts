/*
 * Element Traversal methods from Juriy Zaytsev (kangax)
 * used to emulate Prototype up/down/previous/next methods
 */

type TraversalProperty =
  | 'nextElementSibling'
  | 'previousElementSibling'
  | 'parentElement'
  | 'nextSibling'
  | 'previousSibling'
  | 'parentNode'
type TraversalNode = Node &
  Partial<Pick<Element, 'nextElementSibling' | 'previousElementSibling'>>

;(function (D) {
  var match = D.match,
    select = D.select,
    root = document.documentElement,
    // Use the Element Traversal API if available.
    nextElement: TraversalProperty = 'nextElementSibling',
    previousElement: TraversalProperty = 'previousElementSibling',
    parentElement: TraversalProperty = 'parentElement'
  var nativeTraversal = (
    direction: 'up' | 'down' | 'next' | 'previous',
    element: Node | null,
    expr?: string | number | null,
  ): Element | null | undefined => {
    const native = (
      D as typeof D & {
        nativeTraversal?: (
          direction: 'up' | 'down' | 'next' | 'previous',
          expression: string | number | null | undefined,
          node: Node,
        ) => Element | null | undefined
      }
    ).nativeTraversal
    return native && element ? native(direction, expr, element) : undefined
  }

  // Fall back to the DOM Level 1 API.
  if (!(nextElement in root)) {
    nextElement = 'nextSibling'
  }
  if (!(previousElement in root)) {
    previousElement = 'previousSibling'
  }
  if (!(parentElement in root)) {
    parentElement = 'parentNode'
  }

  function walkElements(
    property: TraversalProperty,
    element: Node | null | undefined,
    expr?: string | number,
  ): Element | null {
    var i = 0,
      isIndex = typeof expr == 'number'
    if (typeof expr == 'undefined') {
      isIndex = true
      expr = 0
    }
    while ((element = (element as TraversalNode)[property])) {
      if (element.nodeType != 1) {
        continue
      }
      if (isIndex) {
        if (i++ == expr) {
          return element as Element | null
        }
      } else if (match(expr as string, element as Element)) {
        return element as Element | null
      }
    }
    return null
  }

  /**
   * @function up
   *
   * @param {HTMLElement} element Element to walk from.
   * @param {String | Number} expr CSS expression or an index.
   *
   * @returns {HTMLElement | null}
   */
  function up(element: Element, expr?: string | number) {
    const native = nativeTraversal('up', element, expr)
    if (native !== undefined) {
      return native
    }
    return walkElements(parentElement, element, expr)
  }
  /**
   * @function next
   *
   * @param {HTMLElement} element Element to walk from.
   * @param {String | Number} expr CSS expression or an index.
   *
   * @returns {HTMLElement | null}
   */
  function next(element: Element, expr?: string | number) {
    const native = nativeTraversal('next', element, expr)
    if (native !== undefined) {
      return native
    }
    return walkElements(nextElement, element, expr)
  }
  /**
   * @function previous
   *
   * @param {HTMLElement} element Element to walk from.
   * @param {String | Number} expr CSS expression or an index.
   *
   * @returns {HTMLElement | null}
   */
  function previous(element: Element, expr?: string | number) {
    const native = nativeTraversal('previous', element, expr)
    if (native !== undefined) {
      return native
    }
    return walkElements(previousElement, element, expr)
  }
  /**
   * @function down
   *
   * @param {HTMLElement} element Element to walk from.
   * @param {String | Number} expr CSS expression or an index.
   *
   * @returns {HTMLElement | null}
   */
  function down(
    element: Node | null,
    expr?: string | number | null,
  ): Element | null {
    const native = nativeTraversal('down', element, expr)
    if (native !== undefined) {
      return native
    }
    var isIndex = typeof expr == 'number',
      descendants,
      index,
      descendant
    if (expr == null) {
      element = element!.firstChild
      while (element && element.nodeType != 1) {
        element = element.nextSibling
      }
      return element as Element | null
    }
    if (
      (!isIndex && match(expr as string, element as Element)) ||
      (isIndex && expr === 0)
    ) {
      return element as Element | null
    }
    descendants = select('*', element!)
    if (isIndex) {
      return descendants[(expr as number) - 1] || null
    }
    index = 0
    while (
      (descendant = descendants[index]) &&
      !match(expr as string, descendant)
    ) {
      ++index
    }
    return descendant || null
  }
  D.up = up
  D.down = down
  D.next = next
  D.previous = previous
})(NW.Dom)
