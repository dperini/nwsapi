// Adapted from Wheelhouse's socket/max-file-lines rule.
// Upstream fixtures are excluded by tooling scope, not by marker exemptions.
import type { AstNode, RuleContext } from '../../lib/rule-types.mts'
const MAX_FILE_HEADER_COMMENT_LINES = 20

const SOFT_CAP = 500
const HARD_CAP = 1000

const BYPASS_RE = /max-file-lines:\s*(?!legitimate\b)[a-z][a-z-]*\s*[—:-]\s*\S/i

const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Files have a soft cap of 500 lines (warn) and a hard cap of 1000 lines (error). Split along natural boundaries.',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      soft: '{{lines}} lines - past the 500-line soft cap; split along natural boundaries (one tool / domain / phase per file).',
      hard: '{{lines}} lines — past the 1000-line hard cap. Split this file. See docs/fleet/style/practices.md.',
    },
    schema: [],
  },

  create(context: RuleContext) {
    const sourceCode = context.getSourceCode
      ? context.getSourceCode()
      : context.sourceCode

    return {
      Program(node: AstNode<'Program'>) {
        const lines = node.loc.end.line

        if (lines <= SOFT_CAP) {
          return
        }

        if (lines > HARD_CAP) {
          const leadingComments = sourceCode
            .getAllComments()
            .filter(c => c.loc.start.line <= MAX_FILE_HEADER_COMMENT_LINES)
          for (let i = 0, { length } = leadingComments; i < length; i += 1) {
            const c = leadingComments[i]!
            if (BYPASS_RE.test(c.value)) {
              return
            }
          }
        }

        const messageId = lines > HARD_CAP ? 'hard' : 'soft'
        context.report({
          loc: { line: 1, column: 0 },
          messageId,
          data: { lines: String(lines) },
        })
      },
    }
  },
}

export default rule
