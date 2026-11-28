type HostWindow = Window & typeof globalThis
type NwsapiCollection = Element[] | NodeListOf<Element>

export function toHostNodeList(
  window: HostWindow,
  nodes: Element[],
): NwsapiCollection {
  const NodeList = window.NodeList
  if (!NodeList) {
    return nodes
  }
  const list = Object.create(NodeList.prototype) as NodeListOf<Element>
  const iterator = (kind: 0 | 1 | 2) => {
    let index = 0
    const result: IterableIterator<unknown> = {
      next() {
        if (index >= nodes.length) {
          return { value: undefined, done: true }
        }
        const current = index++
        return {
          value:
            kind === 1
              ? current
              : kind === 2
                ? ([current, nodes[current]!] as [number, Element])
                : nodes[current]!,
          done: false,
        }
      },
      [Symbol.iterator]() {
        return this
      },
    }
    return result
  }
  Object.defineProperties(list, {
    length: { value: nodes.length },
    item: {
      value(index: number) {
        if (!arguments.length) {
          throw new window.TypeError('Not enough arguments')
        }
        return nodes[index >>> 0] ?? null
      },
    },
    forEach: {
      value(
        callback: (
          value: Element,
          index: number,
          list: NodeListOf<Element>,
        ) => void,
        receiver: unknown,
      ) {
        if (typeof callback !== 'function') {
          throw new window.TypeError('callback must be a function')
        }
        for (let index = 0, length = nodes.length; index < length; index++) {
          callback.call(receiver, nodes[index]!, index, list)
        }
      },
    },
    values: { value: () => iterator(0) },
    keys: { value: () => iterator(1) },
    entries: { value: () => iterator(2) },
    [Symbol.iterator]: { value: () => iterator(0) },
  })
  for (let index = 0, length = nodes.length; index < length; index++) {
    Object.defineProperty(list, index, {
      value: nodes[index],
      enumerable: true,
    })
  }
  return list
}
