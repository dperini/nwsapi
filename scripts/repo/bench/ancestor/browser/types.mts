export type Probe = {
  run(index: number, count: number): void
  detach(): void
  refs: Array<WeakRef<Element>>
}
export type Match = (
  element: Element,
  callback: null,
  context: Document,
  result: boolean,
) => boolean
