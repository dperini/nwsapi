import type { ForOfStatement } from 'acorn'
import noMapAsyncCallback from './rules/no-map-async-callback/index.mts'
import maxCommentBlockLines from './rules/max-comment-block-lines/index.mts'
import maxFileLines from './rules/max-file-lines/index.mts'
import noCommentGlobStarSlash from './rules/no-comment-glob-star-slash/index.mts'
import noMinifiedBundlerOutput from './rules/no-minified-bundler-output/index.mts'
import noSpawnsyncCodeProperty from './rules/no-spawnsync-code-property/index.mts'
import noProcessChdir from './rules/no-process-chdir/index.mts'

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
  rules: {
    'max-file-lines': maxFileLines,
    'no-for-of': noForOf,
    'no-map-async-callback': noMapAsyncCallback,
    'max-comment-block-lines': maxCommentBlockLines,
    'no-comment-glob-star-slash': noCommentGlobStarSlash,
    'no-process-chdir': noProcessChdir,
    'no-spawnsync-code-property': noSpawnsyncCodeProperty,
    'no-minified-bundler-output': noMinifiedBundlerOutput,
  },
}
