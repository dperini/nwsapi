import type { RuleTester } from 'oxlint/plugins-dev'

type NativeRule = Parameters<RuleTester['run']>[1]
type NativeCreate = NonNullable<NativeRule['create']>

export type RuleContext = Parameters<NativeCreate>[0]
type NativeAstNode = NonNullable<
  ReturnType<RuleContext['sourceCode']['getNodeByRangeIndex']>
>
type NativeParameter = Extract<
  NativeAstNode,
  { params: readonly unknown[] }
>['params'][number]
type NativeNode = NativeAstNode | NativeParameter

export type AstComment = ReturnType<
  RuleContext['sourceCode']['getAllComments']
>[number]
export type RuleToken = ReturnType<
  RuleContext['sourceCode']['getTokens']
>[number]
export type RuleScope = ReturnType<RuleContext['sourceCode']['getScope']>
export type RuleFix = ReturnType<RuleFixer['replaceText']>

type NativeNodeForKind<
  Node extends NativeNode,
  Kind extends NativeNode['type'],
> = Node extends unknown
  ? Extract<Node['type'], Kind> extends never
    ? never
    : Node & { type: Extract<Node['type'], Kind> }
  : never

export type AstNode<Kind extends NativeNode['type'] = NativeNode['type']> =
  NativeNodeForKind<NativeNode, Kind>
export type RuleFixer = Parameters<
  NonNullable<Parameters<RuleContext['report']>[0]['fix']>
>[0]
export type RuleListener = ReturnType<NativeCreate>
