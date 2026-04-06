export {};

declare global {
  const NW: {
    Dom: {
      select(selector: string, root: Document | Element): Element[];
    };
  }
}