// Adapted from Wheelhouse. See docs/repo/tooling/style.md.
import type { AstNode, RuleContext } from '../../lib/rule-types.mts'

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid `process.chdir()` — cwd is global process state; pass an explicit `{ cwd }` to the API that needs it instead.',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: undefined,
    messages: {
      processChdir:
        '`process.chdir()` mutates global cwd; pass an explicit `{ cwd }` to the API instead.',
    },
    schema: [],
  },

  create(context: RuleContext) {
    const filename = context.filename ?? context.getFilename?.() ?? ''
    // Test files are exempt — tests chdir intentionally to exercise
    // cwd-sensitive code paths.
    if (/\/test\//.test(filename) || /\.test\.(?:[mc]?[jt]s)$/.test(filename)) {
      return {}
    }

    return {
      CallExpression(node: AstNode<'CallExpression'>) {
        const callee = node.callee
        if (
          callee.type !== 'MemberExpression' ||
          callee.computed ||
          callee.object.type !== 'Identifier' ||
          callee.object.name !== 'process' ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'chdir'
        ) {
          return
        }
        context.report({
          node,
          messageId: 'processChdir',
        })
      },
    }
  },
}

// Oxlint plugin contract requires default-exported rule object.
export default rule
