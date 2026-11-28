import type { HostNode, NativeQueryBinding } from '../native/types.mts'

export type QueryContext = Document | DocumentFragment | Element

export type SnapshotOptions = {
  document: Document
  context: QueryContext
  root: QueryContext
  xmlDocument: boolean
  targetId: string | undefined
  registry: CustomElementRegistry | undefined
  binding: NativeQueryBinding
  selector: string
  selectorStatesRequired: boolean
}

export type HostSnapshot = {
  nodes: QueryContext[]
  rows: HostNode[]
  contextIndex: number
}
