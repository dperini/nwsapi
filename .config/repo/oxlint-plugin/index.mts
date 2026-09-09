import type { ForOfStatement } from 'acorn'

export const noForOf = {
  meta: {
    type: 'suggestion',
    schema: [],
  },
  create(context: {
    report(diagnostic: { node: ForOfStatement; message: string }): void
  }) {
    return {
      ForOfStatement(node: ForOfStatement) {
        context.report({
          node,
          message:
            'Use an indexed loop in runtime code to avoid iterator work and ES5 iterator helpers.',
        })
      },
    }
  },
}

export default {
  meta: { name: 'nwsapi' },
  rules: { 'no-for-of': noForOf },
}
