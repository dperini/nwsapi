import type { EngineState } from './state/engine.d.ts'
import type { EngineContext, PlanCache } from './types.mts'
export function createWeakMap<Key extends WeakKey, Value>(
  engine: EngineState,
): WeakMap<Key, Value> | undefined {
  var Constructor = engine.primordials.WeakMapCtor!
  engine.createWeakMap = function () {
    return new Constructor()
  }
  return engine.createWeakMap<Key, Value>()
}

export function concatCall(
  _engine: EngineState,
  nodes: ArrayLike<Element>,
  callback: (element: Element) => unknown,
) {
  var i = 0,
    l = nodes.length,
    list = Array<Element>(l)
  while (l > i) {
    if (false === callback((list[i] = nodes[i]!))) {
      list.length = i + 1
      break
    }
    ++i
  }
  return list
}

export function concatList(
  _engine: EngineState,
  list: Element[],
  nodes: ArrayLike<Element>,
) {
  var i = -1,
    l = nodes.length
  while (l--) {
    list[list.length] = nodes[++i]!
  }
  return list
}

export function createCache<Value>(
  engine: EngineState,
  limit?: number,
): PlanCache<Value> {
  var young: Map<string, Value> | undefined,
    old: Map<string, Value> | undefined,
    half: number

  limit || (limit = engine.CACHE_LIMIT)
  half = limit > 1 ? limit >> 1 : 1

  return {
    clear: function () {
      young = undefined
      old = undefined
    },
    get: function (key: string) {
      if (!young) {
        return undefined
      }
      var value = young.get(key)
      if (value !== undefined) {
        return value
      }
      if (!old) {
        return undefined
      }
      value = old.get(key)
      if (value !== undefined) {
        // second chance: carry it across before the old generation goes
        old.delete(key)
        if (young.size >= half) {
          old = young
          young = new engine.primordials.MapCtor!<string, Value>()
        }
        young.set(key, value)
      }
      return value
    },
    set: function (key: string, value: Value) {
      if (!young || young.size >= half) {
        old = young
        young = new engine.primordials.MapCtor!<string, Value>()
      }
      young.set(key, value)
      return value
    },
    size: function () {
      return (young ? young.size : 0) + (old ? old.size : 0)
    },
  }
}

export function toNodeList(
  engine: EngineState,
  nodeArray: Element[] | NodeListOf<Element>,
): Element[] | NodeListOf<Element> {
  if (!engine.global.NodeList || engine.isInstanceOf(nodeArray)) {
    return nodeArray
  }
  var list: NodeListOf<Element> = engine.primordials.ObjectCreate(
      engine.global.NodeList.prototype,
    ),
    i: number
  engine.primordials.ObjectDefineProperties(list, {
    length: { value: nodeArray.length },
    item: {
      value: function (index: number) {
        if (!arguments.length) {
          throw new TypeError(engine.qsNotArgs)
        }
        return nodeArray[index >>> 0] || null
      },
    },
    forEach: {
      value: function (
        callback: (
          this: unknown,
          value: Element,
          index: number,
          list: NodeListOf<Element>,
        ) => void,
        receiver: unknown,
      ) {
        if (typeof callback != 'function') {
          throw new TypeError('callback must be a function')
        }
        for (
          var j = 0, nodeArrayLength = nodeArray.length;
          j < nodeArrayLength;
          ++j
        ) {
          callback.call(receiver, nodeArray[j]!, j, list)
        }
      },
    },
  })
  for (
    var nodeArrayLength = nodeArray.length, i = 0;
    i < nodeArrayLength;
    ++i
  ) {
    engine.primordials.ObjectDefineProperty(list, i, {
      value: nodeArray[i],
      enumerable: true,
    })
  }
  if (engine.primordials.SymbolIterator) {
    var iterator = function (kind: number) {
      var index = 0,
        result: {
          next: () => IteratorResult<Element | number | [number, Element]>
          [Symbol.iterator]?: () => typeof result
        } = {
          next: function () {
            if (index >= nodeArray.length) {
              return { value: undefined, done: true }
            }
            var current = index++
            return {
              value:
                kind == 1
                  ? current
                  : kind == 2
                    ? ([current, nodeArray[current]!] as [number, Element])
                    : nodeArray[current]!,
              done: false,
            }
          },
        }
      result[engine.primordials.SymbolIterator!] = function () {
        return this
      }
      return result
    }
    engine.primordials.ObjectDefineProperties(list, {
      values: {
        value: function () {
          return iterator(0)
        },
      },
      keys: {
        value: function () {
          return iterator(1)
        },
      },
      entries: {
        value: function () {
          return iterator(2)
        },
      },
    })
    engine.primordials.ObjectDefineProperty(
      list,
      engine.primordials.SymbolIterator,
      {
        value: list.values,
      },
    )
  }
  return list
}

export function isInstanceOf(
  engine: EngineState,
  nodes: unknown,
): nodes is NodeListOf<Element> {
  return !!engine.global.NodeList && nodes instanceof engine.global.NodeList
}

export function documentOrder(engine: EngineState, a: Element, b: Element) {
  if (!engine.hasDupes && a === b) {
    engine.hasDupes = true
    return 0
  }
  return a.compareDocumentPosition(b) & 4 ? -1 : 1
}

export function mergeResults(
  engine: EngineState,
  nodes: Element[],
  ends: number[],
) {
  var length = nodes.length,
    count = ends.length - 1,
    output: Element[],
    swap: Element[],
    width: number,
    group: number,
    i: number,
    j: number,
    end: number,
    middle: number,
    out: number,
    a: Element,
    b: Element
  if (length < 2 || count < 2) {
    return nodes
  }
  for (group = 1; group < count; ++group) {
    i = ends[group]!
    a = nodes[i - 1]!
    b = nodes[i]!
    if (a === b || !(a.compareDocumentPosition(b) & 4)) {
      break
    }
  }
  if (group == count) {
    return nodes
  }
  output = Array<Element>(length)
  {
    mergeSortedGroups()
  }
  return engine.hasDupes ? engine.unique(nodes) : nodes

  function mergeSortedGroups() {
    for (width = 1; width < count; width *= 2) {
      for (group = 0; group < count; group += width * 2) {
        i = ends[group]!
        middle = ends[Math.min(group + width, count)]!
        j = middle
        end = ends[Math.min(group + width * 2, count)]!
        out = i
        while (i < middle && j < end) {
          a = nodes[i]!
          b = nodes[j]!
          if (a === b) {
            engine.hasDupes = true
            output[out++] = a
            ++i
          } else if (a.compareDocumentPosition(b) & 4) {
            output[out++] = a
            ++i
          } else {
            output[out++] = b
            ++j
          }
        }
        while (i < middle) {
          output[out++] = nodes[i++]!
        }
        while (j < end) {
          output[out++] = nodes[j++]!
        }
      }
      swap = nodes
      nodes = output
      output = swap
    }
  }
}

export function unique(engine: EngineState, nodes: Element[]) {
  var i = 0,
    j = -1,
    l = nodes.length + 1,
    list = []
  while (--l) {
    if (nodes[i++] === nodes[i]) {
      continue
    }
    list[++j] = nodes[i - 1]!
  }
  engine.hasDupes = false
  return list
}

export function switchContext(
  engine: EngineState,
  context: EngineContext,
  force?: boolean | undefined,
) {
  var oldDoc = engine.doc
  engine.partCounts.clear()
  engine.typeRoutes.clear()
  engine.doc = (context.ownerDocument || context) as Document
  if (force || oldDoc !== engine.doc) {
    // force a new check for each document change
    // performed before the next select operation
    engine.root = engine.doc.documentElement
    // Compiled case and namespace checks belong to this document.
    engine.matchLambdas.clear()
    engine.selectLambdas.clear()
    engine.matchResolvers.clear()
    engine.selectResolvers.clear()
    engine.firstResolvers.clear()
    engine.hasPlans = undefined
    if (
      engine.legacyHooks &&
      !engine.Config.LEGACY &&
      engine.legacyHooks.detect(engine.doc)
    ) {
      engine.Config.LEGACY = true
    }
    engine.useLegacy(engine.Config.LEGACY)
    engine.HTML_DOCUMENT = engine.isHTML(engine.doc)
    engine.QUIRKS_MODE =
      engine.HTML_DOCUMENT && engine.doc.compatMode.indexOf('CSS') < 0
    engine.NAMESPACE = engine.root && engine.root.namespaceURI
    engine.Snapshot.doc = engine.doc
    engine.Snapshot.root = engine.root
    engine.hoverWanted && engine.trackHover()
  }
  return (engine.Snapshot.from = context)
}

export function codePointToUTF16(_engine: EngineState, codePoint: number) {
  // out of range, use replacement character
  if (
    codePoint < 1 ||
    codePoint > 0x10ffff ||
    (codePoint > 0xd7ff && codePoint < 0xe000)
  ) {
    return '\\ufffd'
  }
  // javascript strings are UTF-16 encoded
  if (codePoint < 0x10000) {
    var lowHex = '000' + codePoint.toString(16)
    return '\\u' + lowHex.substr(lowHex.length - 4)
  }
  // supplementary high + low surrogates
  return (
    '\\u' +
    (((codePoint - 0x10000) >> 0x0a) + 0xd800).toString(16) +
    '\\u' +
    (((codePoint - 0x10000) % 0x400) + 0xdc00).toString(16)
  )
}
