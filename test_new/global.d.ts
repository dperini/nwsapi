import type { PwHelpers } from './browser/harness/browser';

export {};

declare global {
  type QueryContext = Document | Element | DocumentFragment;
  type NwCallback = (element: Element) => boolean | void;

  interface Window {
    __pwHelpers: PwHelpers;
    __pwXml: XMLDocument;
    __pwArg: unknown;
  }

  const NW: {
    Dom: {
      byId(id: string, ctx: QueryContext): Element[];
      byTag(tag: string, ctx: QueryContext): Element[];
      byClass(cls: string, ctx: QueryContext): Element[];

      select(selector: string, ctx?: QueryContext | null, callback?: NwCallback | null): Element[];
      first(selector: string, ctx?: QueryContext | null, callback?: NwCallback | null): Element | null;
      match(selector: string, ctx?: Element | null, callback?: NwCallback | null): boolean;
      closest(selector: string, ctx: Element, callback?: NwCallback | null): Element | null;

      configure(options: Record<string, boolean>): void;
    };
  };
}