import type { SelectorExtension } from '../state/types.mts'
import type { EngineState } from '../state/engine.d.ts'
import type {
  AttributeOperator,
  CompilerAncestry,
  ElementCallback,
} from '../state/types.mts'
export interface CompileState {
  engine: EngineState
  expression: string
  source: string
  mode: boolean | null
  callback: boolean | ElementCallback
  ancestry: CompilerAncestry
  a: number
  b: number
  n: string[]
  f: boolean
  k: number
  previousErrors: number
  compat: string
  name: string
  NS: boolean
  attributeSource: string
  attributeGuard: string
  attributePattern: string
  expr: string | boolean | undefined
  value: string
  match: RegExpMatchArray | null | undefined
  pendingTag: string
  firstChildOnly: boolean
  classTests: string[]
  classIndex: number
  result: ReturnType<SelectorExtension['Callback']>
  status: boolean
  symbol: number
  test: string | AttributeOperator | undefined
  type: string | boolean
  selector: string
  shadow: boolean
  pseudo: ReturnType<EngineState['readPseudo']>
  vars: string | undefined
  argument: string | null
  flag: string
  nested: string
  read: {
    tag: (v: string) => string
    id: (v: string) => string
    cls: (v: string) => string
    up: (v: string) => string
    next: (v: string) => string
    prev: (v: string) => string
    attr: (v: string, name: string) => string
    has: (v: string, name: string) => string
  }
}
