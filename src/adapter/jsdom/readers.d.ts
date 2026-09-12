// Optional readers supplied by the jsdom adapter before the first compilation.
export interface HostReaders {
  attrOf?(element: Element, name: string): string | null
  hasAttrOf?(element: Element, name: string): boolean
  upOf?(element: Element): Element | null
  nextOf?(element: Element): Element | null
  prevOf?(element: Element): Element | null
}
