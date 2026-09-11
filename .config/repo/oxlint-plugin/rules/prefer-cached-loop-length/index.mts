import type { AstNode, RuleContext } from '../../lib/rule-types.mts'

function isLengthRead(node: AstNode): boolean {
  if (node.type !== 'MemberExpression') {
    return false
  }
  const property = node.property
  return node.computed
    ? property.type === 'Literal' && property.value === 'length'
    : property.type === 'Identifier' && property.name === 'length'
}

function containsLengthRead(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  if (Array.isArray(value)) {
    for (let i = 0, { length } = value; i < length; i += 1) {
      if (containsLengthRead(value[i])) {
        return true
      }
    }
    return false
  }
  const node = value as AstNode
  if (isLengthRead(node)) {
    return true
  }
  for (const key of Object.keys(node)) {
    if (key !== 'parent' && containsLengthRead(Reflect.get(node, key))) {
      return true
    }
  }
  return false
}

export default {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      uncachedLength:
        'Cache the collection length in the indexed loop initializer and compare against that local value.',
    },
  },
  create(context: RuleContext) {
    return {
      ForStatement(node: AstNode<'ForStatement'>) {
        if (containsLengthRead(node.test)) {
          context.report({
            node: node.test ?? node,
            messageId: 'uncachedLength',
          })
        }
      },
    }
  },
}
