// Adapted from Wheelhouse. See docs/repo/tooling/style.md.
import type { RuleContext, RuleFixer } from '../../lib/rule-types.mts'

// Walk the comment text char by char, tracking backtick depth. At every
// star-run-then-optional-backslash-then-slash boundary seen OUTSIDE a backtick
// span, insert a backtick break so the stars and the slash land in separate
// backtick runs (the stars get their own run; the rest of the glob token gets
// one). A boundary already inside backticks is left alone — so the transform is
// idempotent, re-running on fixed text is a no-op, and never doubles a backtick.
//   double-star-slash-star-dot-yml      -> backtick-stars + slash + backtick-rest
//   escaped backslash form               -> same, the backslash is dropped
//   an already-backtick-split occurrence -> unchanged
// Returns the rewritten text; equal to the input when there was nothing to fix.

/**
 * U+200B ZERO WIDTH SPACE, as an escape so this file stays pure ASCII
 * and cannot carry the character it exists to remove -
 * `no-irregular-whitespace` would flag this very rule.
 */
export const ZWSP = '\u200B'

/**
 * Rewrite the zero-width-space workaround to the same backtick split.
 *
 * Wedging a ZWSP between the stars and the slash is an older hand fix for this
 * exact hazard: it stops `*` immediately preceding `/` from closing the block.
 * It works, but `no-irregular-whitespace` rejects a ZWSP, so a file carrying
 * one could satisfy neither rule and no autofix moved it — 19 sites across 16
 * files sat that way, blocking every push.
 *
 * Rewritten in ONE step on purpose. Dropping the ZWSP by itself would leave a
 * literal star-slash that ends the comment early and turns the rest of the file
 * into a parse error, which is the failure this whole rule exists to prevent.
 *
 * Unlike the walk below, this applies INSIDE backtick spans too: the workaround
 * is nearly always written inside one, which is precisely why the walk never
 * saw it.
 */
export function splitZwspGlobs(value: string): string {
  return value.replaceAll(`*${ZWSP}/`, '*`/`')
}

export function backtickSplitGlobs(value: string): string {
  // The ZWSP pre-pass runs first, so the walk below sees ordinary text and the
  // detector (output !== input) flags a ZWSP comment for free.
  const source = splitZwspGlobs(value)
  let out = ''
  let inTick = false
  for (let i = 0, { length } = source; i < length; i += 1) {
    const c = source[i]!
    if (c === '`') {
      inTick = !inTick
      out += c
      continue
    }
    if (!inTick && c === '*') {
      let j = i
      while (source[j] === '*') {
        j += 1
      }
      let k = j
      if (source[k] === '\\') {
        k += 1
      }
      if (source[k] === '/') {
        // Boundary found: emit `<stars>`/` then the rest of the glob token
        // non-space, non-backtick, wrapped in its own backtick run.
        const stars = source.slice(i, j)
        let m = k + 1
        while (m < length && !/\s/.test(source[m]!) && source[m] !== '`') {
          m += 1
        }
        out += `\`${stars}\`/\`${source.slice(k + 1, m)}\``
        i = m - 1
        continue
      }
    }
    out += c
  }
  return out
}

// Does the comment body carry a star-then-slash sequence in prose, OUTSIDE any
// backtick span, an already-backtick-split glob is fine? `value` is the comment
// text without the delimiters, so the fix and the detector use the same walk:
// the body needs a fix exactly when re-emitting it would differ.
function bodyHasGlobStarSlash(value: string): boolean {
  return backtickSplitGlobs(value) !== value
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Forbid a `*/`-forming glob sequence in a block comment; oxfmt's jsdoc reflow turns it into a comment-closing token and corrupts the file. Backtick-split the glob instead.",
      category: 'Possible Errors',
      recommended: true,
    },
    fixable: 'code',
    messages: {
      globStarSlash:
        'Comment glob `{{snippet}}` - oxfmt reflow closes the comment. Backtick-split (e.g. `**`/`*.yml` → `` `**`/`*.yml` ``).',
    },
    schema: [],
  },

  create(context: RuleContext) {
    const sourceCode = context.getSourceCode
      ? context.getSourceCode()
      : context.sourceCode
    return {
      Program() {
        const comments = sourceCode.getAllComments
          ? sourceCode.getAllComments()
          : []
        for (let i = 0, { length } = comments; i < length; i += 1) {
          const comment = comments[i]!
          // Line comments have no closing token to break — only block comments
          // are at risk.
          if (comment.type !== 'Block') {
            continue
          }
          if (!bodyHasGlobStarSlash(comment.value)) {
            continue
          }
          // First offending token, for the message only (the fix rewrites every
          // occurrence). Match a star-run + optional backslash + slash + tail.
          // Star-run, then the ZWSP workaround or an escaping
          // backslash, then the slash and the rest of the token. Both
          // forms reach here, so both must match or the message falls
          // back to a bare token.
          const m = /\*+(?:\\|\u200B)?\/\S*/.exec(comment.value)
          /* c8 ignore start - bodyHasGlobStarSlash true guarantees m is non-null; the else arm is unreachable */
          const snippet = m ? m[0].replace(/\\|\u200B/g, '') : '*/'
          /* c8 ignore stop */
          context.report({
            node: comment,
            messageId: 'globStarSlash',
            data: { snippet },
            fix(fixer: RuleFixer) {
              // Rebuild the whole comment with every glob backtick-split. The
              // comment range covers the `/*`...`*/` delimiters; reconstruct
              // them around the fixed body so the close token is untouched.
              const fixedBody = backtickSplitGlobs(comment.value)
              return fixer.replaceText(comment, `/*${fixedBody}*/`)
            },
          })
        }
      },
    }
  },
}

// Oxlint plugin contract requires default-exported rule object.
export default rule
