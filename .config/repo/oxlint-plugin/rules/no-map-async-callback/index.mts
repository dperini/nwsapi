// Adapted from Wheelhouse. Only identifiable arrays enter this check.
import type { AstNode, RuleContext } from '../../lib/rule-types.mts'

function isArray(node: AstNode, context: RuleContext): boolean {
  if (node.type === 'ArrayExpression') {
    return true
  }
  if (node.type !== 'Identifier') {
    return false
  }
  let scope: ReturnType<RuleContext['sourceCode']['getScope']> | null =
    context.sourceCode.getScope(node)
  while (scope) {
    const variable = scope.set.get(node.name)
    if (variable) {
      // Unknown values and reassigned bindings need type-aware analysis.
      return (
        variable.defs.some(
          definition =>
            definition.type === 'Variable' &&
            definition.node.type === 'VariableDeclarator' &&
            definition.node.init?.type === 'ArrayExpression',
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
      discardedAsyncMap:
        'This array map discards the promises returned by its async callback. Await or return the work, or use a sequential loop.',
    },
  },
  create(context: RuleContext) {
    return {
      ExpressionStatement(node: AstNode<'ExpressionStatement'>) {
        const call = node.expression
        if (
          call.type !== 'CallExpression' ||
          call.callee.type !== 'MemberExpression'
        ) {
          return
        }
        const { callee } = call
        const callback = call.arguments[0]
        if (
          callee.computed ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'map' ||
          !callback ||
          (callback.type !== 'ArrowFunctionExpression' &&
            callback.type !== 'FunctionExpression') ||
          !callback.async ||
          !isArray(callee.object, context)
        ) {
          return
        }
        context.report({ node, messageId: 'discardedAsyncMap' })
      },
    }
  },
}
