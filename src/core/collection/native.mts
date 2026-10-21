export function hasNativeCollectionLength(document: Document) {
  try {
    const view = document.defaultView as (Window & typeof globalThis) | null
    const prototype = view?.HTMLCollection?.prototype
    const getter =
      prototype && Object.getOwnPropertyDescriptor(prototype, 'length')?.get
    return (
      !!getter &&
      /\{\s*\[native code\]\s*\}$/.test(
        Function.prototype.toString.call(getter),
      )
    )
  } catch {
    return false
  }
}
