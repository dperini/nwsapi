// Supply the reflected boolean IDL attribute on hosts that lack switch controls.
// Selector matching remains entirely in the installed engine.
if (!('switch' in HTMLInputElement.prototype)) {
  Object.defineProperty(HTMLInputElement.prototype, 'switch', {
    configurable: true,
    enumerable: true,
    get(this: HTMLInputElement) {
      return this.hasAttribute('switch')
    },
    set(this: HTMLInputElement, value: unknown) {
      this.toggleAttribute('switch', !!value)
    },
  })
}
