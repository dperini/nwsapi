// Adapted from Wheelhouse for Node's spawnSync result contract.
import type { AstNode, RuleContext } from '../../lib/rule-types.mts'

function isSpawnSyncCall(node: AstNode | null | undefined): boolean {
  if (node?.type !== 'CallExpression') {
    return false
  }
  const callee = node.callee
  return (
    (callee.type === 'Identifier' && callee.name === 'spawnSync') ||
    (callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'spawnSync')
  )
}

function isSpawnSyncResult(node: AstNode, context: RuleContext): boolean {
  if (node.type !== 'Identifier') {
    return isSpawnSyncCall(node)
  }
  // Resolve the binding so a shadowed name does not inherit an outer result.
  let scope: ReturnType<RuleContext['sourceCode']['getScope']> | null =
    context.sourceCode.getScope(node)
  while (scope) {
    const variable = scope.set.get(node.name)
    if (variable) {
      return (
        variable.defs.some(
          definition =>
            definition.type === 'Variable' &&
            definition.node.type === 'VariableDeclarator' &&
            isSpawnSyncCall(definition.node.init),
        ) &&
        !variable.references.some(
          reference => reference.isWrite() && !reference.init,
        )
      )
    }
    scope = scope.upper
  }
  return false
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      spawnsyncCodeField:
        'A spawnSync result exposes its exit status as `.status`, not `.code`. Check `.error` and `.signal` when no exit status is available.',
    },
  },
  create(context: RuleContext) {
    return {
      MemberExpression(node: AstNode<'MemberExpression'>) {
        const property = node.property
        const isCode = node.computed
          ? property.type === 'Literal' && property.value === 'code'
          : property.type === 'Identifier' && property.name === 'code'
        if (isCode && isSpawnSyncResult(node.object, context)) {
          context.report({ node, messageId: 'spawnsyncCodeField' })
        }
      },
    }
  },
}
