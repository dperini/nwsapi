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

export type InstalledQueryMethod =
  | 'closest'
  | 'match'
  | 'first'
  | 'select'
  | `traverse:${'up' | 'down' | 'next' | 'previous'}:${string}`
/**
 * Return undefined to delegate unsupported queries to v3.
 */
export type InstalledQuery = ((
  method: InstalledQueryMethod,
  selector: string,
  context: EngineContext,
) => Element[] | undefined) & { clearCache?(): void }

type Installation = {
  engine: EngineState
  backend: InstalledQuery | undefined
  restore(): void
}
type InstallationEntry = { key: object; installation: Installation }
let installations: WeakMap<object, Installation> | undefined
const installationEntries: InstallationEntry[] = []

function getInstallation(key: object): Installation | undefined {
  if (installations) {
    return installations.get(key)
  }
  return installationEntries.find(entry => entry.key === key)?.installation
}

function setInstallation(key: object, installation: Installation) {
  if (installations) {
    installations.set(key, installation)
    return
  }
  const entry = installationEntries.find(entry => entry.key === key)
  if (entry) {
    entry.installation = installation
  } else {
    installationEntries.push({ key, installation })
  }
}

function deleteInstallation(key: object) {
  if (installations) {
    installations.delete(key)
    return
  }
  const index = installationEntries.findIndex(entry => entry.key === key)
  if (index !== -1) {
    installationEntries.splice(index, 1)
  }
}

function saveMethods(prototype: object, methodNames: readonly string[]) {
  const target = prototype as Record<string, unknown>
  const descriptors = methodNames.map(name =>
    Object.getOwnPropertyDescriptor(target, name),
  )
  return () => {
    for (let index = 0, length = methodNames.length; index < length; index++) {
      const name = methodNames[index]!
      const descriptor = descriptors[index]
      if (descriptor) {
        Object.defineProperty(target, name, descriptor)
      } else {
        delete target[name]
      }
    }
  }
}

export function install(
  engine: EngineState,
  all?: boolean,
  backend?: InstalledQuery,
) {
  if (!installations && engine.primordials.WeakMapCtor) {
    installations = new engine.primordials.WeakMapCtor<object, Installation>()
  }
  var Element = engine.global.Element,
    HTMLElement = engine.global.HTMLElement,
    Document = engine.global.Document,
    DocumentFragment = engine.global.DocumentFragment

  const key = Element.prototype
  const existing = getInstallation(key)
  if (existing) {
    uninstall(existing.engine)
  }
  const elementMethods = [
    'closest',
    'matches',
    'querySelector',
    'querySelectorAll',
  ]
  const rootMethods = ['querySelector', 'querySelectorAll']
  const restoreElement = saveMethods(Element.prototype, elementMethods)
  const restoreHtml = saveMethods(HTMLElement.prototype, elementMethods)
  const restoreDocument = saveMethods(Document.prototype, rootMethods)
  const restoreFragment = saveMethods(DocumentFragment.prototype, rootMethods)
  setInstallation(key, {
    engine,
    backend,
    restore() {
      restoreFragment()
      restoreDocument()
      restoreHtml()
      restoreElement()
    },
  })

  function queryBackend(
    method: InstalledQueryMethod,
    context: EngineContext,
    args: IArguments,
  ): Element[] | undefined {
    if (backend && args.length === 1 && typeof args[0] === 'string') {
      return backend(method, args[0], context)
    }
    return undefined
  }

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

  try {
    Element.prototype.closest = HTMLElement.prototype.closest =
      function closest(this: Element) {
        const native = queryBackend('closest', this, arguments)
        if (native) {
          return native[0] ?? null
        }
        return (parseQSArgs<Element | null>).apply(
          this,
          engine.argsWith(arguments, engine.ancestor),
        )
      }

    Element.prototype.matches = HTMLElement.prototype.matches =
      function matches(this: Element): this is Element {
        const native = queryBackend('match', this, arguments)
        if (native) {
          return native.length > 0
        }
        return (parseQSArgs<boolean>).apply(
          this,
          engine.argsWith(arguments, engine.match),
        )
      } as Element['matches']

    Element.prototype.querySelector = HTMLElement.prototype.querySelector =
      function querySelector(this: EngineContext) {
        const native = queryBackend('first', this, arguments)
        if (native) {
          return native[0] ?? null
        }
        return (parseQSArgs<Element | null>).apply(
          this,
          engine.argsWith(arguments, engine.first),
        )
      }

    Element.prototype.querySelectorAll =
      HTMLElement.prototype.querySelectorAll = function querySelectorAll(
        this: EngineContext,
      ) {
        const native = queryBackend('select', this, arguments)
        return engine.toNodeList(
          native ??
            (parseQSArgs<Element[]>).apply(
              this,
              engine.argsWith(arguments, engine.select),
            ),
        ) as NodeListOf<Element>
      }

    Document.prototype.querySelector =
      DocumentFragment.prototype.querySelector = function querySelector(
        this: EngineContext,
      ) {
        const native = queryBackend('first', this, arguments)
        if (native) {
          return native[0] ?? null
        }
        return (parseQSArgs<Element | null>).apply(
          this,
          engine.argsWith(arguments, engine.first),
        )
      }

    Document.prototype.querySelectorAll =
      DocumentFragment.prototype.querySelectorAll = function querySelectorAll(
        this: EngineContext,
      ) {
        const native = queryBackend('select', this, arguments)
        return engine.toNodeList(
          native ??
            (parseQSArgs<Element[]>).apply(
              this,
              engine.argsWith(arguments, engine.select),
            ),
        ) as NodeListOf<Element>
      }
  } catch (error) {
    uninstall(engine)
    throw error
  }

  if (all && engine.legacyHooks) {
    engine.legacyHooks.installFrames(
      engine.doc,
      window => engine.Factory(window) as unknown as typeof NW.Dom,
    )
  }
}

export function uninstall(engine: EngineState) {
  const key = engine.global.Element.prototype
  const installation = getInstallation(key)
  if (installation && installation.engine === engine) {
    installation.restore()
    deleteInstallation(key)
    installation.backend?.clearCache?.()
  }
}
