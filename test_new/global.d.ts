export {};

declare global {
  const NW: {
    Dom: {
      select(selector: string, root: Document | Element): Element[];
      configure(options: Record<string, boolean>): void;
    };
  }
}