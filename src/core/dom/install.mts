import type { EngineState, EngineContext } from '../state/types.mts'

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
