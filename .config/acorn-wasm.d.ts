// Version 0.1.1 has no declarations. Describe the visitor API used by our tests.
declare module '@ultrathink/acorn.rs.wasm' {
  interface Node {
    type: string
    start: number
    end: number
    argument?: Node | null
    name?: string
  }

  export function simple(
    source: string,
    visitors: Record<string, (node: Node) => void>,
    options: { sourceType: 'script' | 'module' },
  ): void
}
