import type { EngineState } from '../state/engine.d.ts'
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
