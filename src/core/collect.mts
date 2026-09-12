import type { EngineState } from './state/engine.d.ts'
import type {
  CompiledResolver,
  ElementCallback,
  EngineContext,
} from './types.mts'
export function collect(
  engine: EngineState,
  selectors: string[],
  context: EngineContext,
  callback: ElementCallback,
  relative?: boolean | undefined,
  firstOnly?: boolean | undefined,
  existenceOnly?: boolean | undefined,
) {
  var i: number,
    l: number,
    seen: Record<string, boolean> = {},
    token: string[] = ['', '*', '*'],
    optimized = selectors,
    factory = Array<CompiledResolver | null>(selectors.length),
    candidates: ArrayLike<Element>,
    nodeset = Array<string>(selectors.length),
    results: Element[] = [],
    type

  for (i = 0, l = selectors.length; l > i; ++i) {
    if (!seen[selectors[i]!] && (seen[selectors[i]!] = true)) {
      optimizeCandidateToken()
      // Class lookup narrows candidates; the attribute resolver still
      // checks case and values, including in quirks mode.
      {
        routeAttributeSelector()
      }
    }

    // unescape before recording the token: 'nodeset' is what a later
    // run rebuilds its candidate list from, so the two must agree
    token[2] = engine.unescapeIdentifier(token[2]!)
    nodeset[i] = token[1]! + token[2]!
    factory[i] = engine.compile(
      optimized[i]!,
      existenceOnly || !firstOnly,
      null,
      relative,
      existenceOnly,
    )

    if (firstOnly) {
      continue
    }

    candidates = engine.fetch[token[1]!]!(token[2]!, context)
    if (factory[i]!) {
      factory[i]!(candidates, callback, context, results)
    } else {
      engine.concatList(results, candidates)
    }
  }

  if (l > 1) {
    results.sort(engine.documentOrder)
    engine.hasDupes && (results = engine.unique(results))
  }

  return {
    factory: factory,
    nodeset: nodeset,
    results: results,
  }

  function optimizeCandidateToken() {
    type = selectors[i]!.match(engine.reOptimizer)
    // Escaped delimiters can resemble a terminal tag inside an attribute.
    // Compile escaped selectors intact instead of narrowing that token.
    if (
      type &&
      type[1] != ':' &&
      selectors[i]!.indexOf('\\') < 0 &&
      (token = type)
    ) {
      token[1]! || (token[1] = '*')
      optimized[i] = engine.optimize(optimized[i]!, token as RegExpMatchArray)
    } else {
      token = ['', '*', '*']
      // A terminal union of types can fetch its alternatives instead
      // of every element. Keep the complete predicate in the resolver,
      // including any compound or ancestor constraints around the list.
      type =
        /:(?:is|where)\(([a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)+)\)$/.exec(
          selectors[i]!,
        )
      if (
        !firstOnly &&
        type &&
        /^[.#*\w\t\n\f\r >+~-]*$/.test(selectors[i]!.slice(0, type.index))
      ) {
        token = ['', '?', type[1]!]
      }
    }
  }

  function routeAttributeSelector() {
    if (
      engine.HTML_DOCUMENT &&
      !engine.Config.LEGACY &&
      (type = selectors[i]!.match(engine.Patterns['attribute']!)) &&
      type[0] == selectors[i]! &&
      type[1] == 'class' &&
      type[2] == '~=' &&
      type[4] &&
      type[5] != 'i' &&
      !/[\t\n\f\r ]/.test(engine.unescapeIdentifier(type[4])) &&
      engine.Operators['~=']!.p1 == '(^|[\\t\\n\\f\\r ])' &&
      engine.Operators['~=']!.p2 == '([\\t\\n\\f\\r ]|$)' &&
      engine.Operators['~=']!.p3 == 'true'
    ) {
      token = ['', '.', type[4]]
    }
  }
}

export function hoverChanged(engine: EngineState, event: MouseEvent) {
  var targetDoc =
      (event.target as Node).ownerDocument || (event.target as Document),
    record = engine.hoverTracked
      ? engine.hoverTracked.get(targetDoc)
      : targetDoc === engine.hoverDoc
        ? engine.hoverRecord
        : undefined
  if (record) {
    record.target = event.type == 'mouseover' ? event.target : undefined
    if (targetDoc === engine.doc) {
      engine.Snapshot.HOVER = record.target
    }
  }
}

export function trackHover(engine: EngineState) {
  engine.hoverWanted = true
  if (!engine.doc) {
    return
  }
  if (engine.hoverTracked === null) {
    engine.hoverTracked = engine.createWeakMap()
  }
  var record = engine.hoverTracked
    ? engine.hoverTracked.get(engine.doc)
    : engine.hoverDoc === engine.doc
      ? engine.hoverRecord
      : undefined
  if (!record) {
    record = { target: undefined }
    if (engine.hoverTracked) {
      engine.hoverTracked.set(engine.doc, record)
    }
    // Stable callbacks avoid duplicate listeners even without WeakMap.
    engine.doc.addEventListener('mouseover', engine.hoverChanged, true)
    engine.doc.addEventListener('mouseout', engine.hoverChanged, true)
  }
  engine.hoverDoc = engine.doc
  engine.hoverRecord = record
  engine.Snapshot.HOVER = record.target
}

export function argsWith<Value>(
  engine: EngineState,
  args: ArrayLike<Value>,
  tail: Value,
) {
  switch (args.length) {
    case 0:
      return [tail]
    case 1:
      return [args[0], tail]
    case 2:
      return [args[0], args[1], tail]
    case 3:
      return [args[0], args[1], args[2], tail]
    case 4:
      return [args[0], args[1], args[2], args[3], tail]
    case 5:
      return [args[0], args[1], args[2], args[3], args[4], tail]
    case 6:
      return [args[0], args[1], args[2], args[3], args[4], args[5], tail]
    case 7:
      return [
        args[0],
        args[1],
        args[2],
        args[3],
        args[4],
        args[5],
        args[6],
        tail,
      ]
    case 8:
      return [
        args[0],
        args[1],
        args[2],
        args[3],
        args[4],
        args[5],
        args[6],
        args[7],
        tail,
      ]
    default:
      return (engine.sliceCall as <Value>(args: ArrayLike<Value>) => Value[])(
        args,
      ).concat(tail)
  }
}

export function install(engine: EngineState, all?: boolean) {
  var Element = engine.global.Element,
    HTMLElement = engine.global.HTMLElement,
    Document = engine.global.Document,
    DocumentFragment = engine.global.DocumentFragment

  // Saved DOM methods are invoked with their receiver or restored below.
  /* oxlint-disable typescript/unbound-method */
  engine._closest = Element.prototype.closest
  engine._matches = Element.prototype.matches

  engine._querySelector = Element.prototype.querySelector
  engine._querySelectorAll = Element.prototype.querySelectorAll

  engine._querySelectorDoc = Document.prototype.querySelector
  engine._querySelectorAllDoc = Document.prototype.querySelectorAll
  /* oxlint-enable typescript/unbound-method */

  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Native wrappers supply the resolver return type.
  function parseQSArgs<Result>(this: EngineContext, ...args: unknown[]): Result
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Native wrappers supply the resolver return type.
  function parseQSArgs<Result>(this: EngineContext): Result {
    var method = arguments[arguments.length - 1] as (
      ...args: unknown[]
    ) => Result
    return arguments.length < 2
      ? method.apply(this, [])
      : arguments.length < 3
        ? method.apply(this, [arguments[0], this])
        : method.apply(this, [
            arguments[0],
            this,
            typeof arguments[1] == 'function' ? arguments[1] : undefined,
          ])
  }

  Element.prototype.closest = HTMLElement.prototype.closest = function closest(
    this: Element,
  ) {
    return (parseQSArgs<Element | null>).apply(
      this,
      engine.argsWith(arguments, engine.ancestor),
    )
  }

  Element.prototype.matches = HTMLElement.prototype.matches = function matches(
    this: Element,
  ): this is Element {
    return (parseQSArgs<boolean>).apply(
      this,
      engine.argsWith(arguments, engine.match),
    )
  } as Element['matches']

  Element.prototype.querySelector = HTMLElement.prototype.querySelector =
    function querySelector(this: EngineContext) {
      return (parseQSArgs<Element | null>).apply(
        this,
        engine.argsWith(arguments, engine.first),
      )
    }

  Element.prototype.querySelectorAll = HTMLElement.prototype.querySelectorAll =
    function querySelectorAll(this: EngineContext) {
      return engine.toNodeList(
        (parseQSArgs<Element[]>).apply(
          this,
          engine.argsWith(arguments, engine.select),
        ),
      ) as NodeListOf<Element>
    }

  Document.prototype.querySelector = DocumentFragment.prototype.querySelector =
    function querySelector(this: EngineContext) {
      return (parseQSArgs<Element | null>).apply(
        this,
        engine.argsWith(arguments, engine.first),
      )
    }

  Document.prototype.querySelectorAll =
    DocumentFragment.prototype.querySelectorAll = function querySelectorAll(
      this: EngineContext,
    ) {
      return engine.toNodeList(
        (parseQSArgs<Element[]>).apply(
          this,
          engine.argsWith(arguments, engine.select),
        ),
      ) as NodeListOf<Element>
    }

  if (all && engine.legacyHooks) {
    engine.legacyHooks.installFrames(
      engine.doc,
      window => engine.Factory(window) as unknown as typeof NW.Dom,
    )
  }
}

export function uninstall(engine: EngineState) {
  var Element = engine.global.Element,
    HTMLElement = engine.global.HTMLElement,
    Document = engine.global.Document,
    DocumentFragment = engine.global.DocumentFragment

  // restore references
  if (engine._closest) {
    Element.prototype.closest = engine._closest
    HTMLElement.prototype.closest = engine._closest
  }
  if (engine._matches) {
    Element.prototype.matches = engine._matches
    HTMLElement.prototype.matches = engine._matches
  }
  if (engine._querySelector) {
    Element.prototype.querySelector = HTMLElement.prototype.querySelector =
      engine._querySelector
    Element.prototype.querySelectorAll =
      HTMLElement.prototype.querySelectorAll = engine._querySelectorAll
  }
  if (engine._querySelectorAllDoc) {
    Document.prototype.querySelector =
      DocumentFragment.prototype.querySelector = engine._querySelectorDoc
    Document.prototype.querySelectorAll =
      DocumentFragment.prototype.querySelectorAll = engine._querySelectorAllDoc
  }
}
