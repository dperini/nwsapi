export {};

declare global {
  const NW: {
    Dom: {
      select(
        selector: string,
        root?: ParentNode | Document | Element | null,
        callback?: ((element: Element) => boolean | void) | null,
      ): Element[];
      configure(options: Record<string, boolean>): void;
    };
  }
}