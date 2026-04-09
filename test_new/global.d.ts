import type { PwHelpers } from './browser/harness/browser';

export {};

declare global {
  interface Window {
    __pwHelpers: PwHelpers;
  }
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