// Version 0.1.1 has no declarations. Describe the AST query used by our tests.
declare module '@ultrathink/acorn.rs.wasm' {
  import type { Program } from 'acorn'

  export function aqs_match(source: string, selector: string): string
  export function parse(
    source: string,
    options?: {
      ecmaVersion?: 'latest' | number
      sourceType?: 'module' | 'script'
      typescript?: boolean
    },
  ): Program
}
