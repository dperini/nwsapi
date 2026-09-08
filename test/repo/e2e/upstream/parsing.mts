import { parse } from 'acorn'
import { JSDOM } from 'jsdom'

// This mixed upstream page also tests rendering. Keep only its direct
// selector helper calls and fail when an upstream change needs review.
export function adaptSelectorInputs(source: string, expected: number) {
  const dom = new JSDOM(source)
  const helpers = new Set([
    'test_valid_selector',
    'test_valid_forgiving_selector',
    'test_invalid_selector',
  ])
  let selected = 0
  try {
    for (const script of dom.window.document.scripts) {
      if (script.src || !script.textContent) {
        continue
      }
      const code = script.textContent
      const ast = parse(code, { ecmaVersion: 'latest' })
      const inputs: string[] = []
      for (const node of ast.body) {
        if (
          node.type === 'ExpressionStatement' &&
          node.expression.type === 'CallExpression' &&
          node.expression.callee.type === 'Identifier' &&
          helpers.has(node.expression.callee.name)
        ) {
          inputs.push(code.slice(node.start, node.end))
          selected++
        }
      }
      script.textContent = inputs.join('\n')
    }
    if (selected !== expected) {
      throw new Error(
        'The upstream selector inputs changed. Review the adapter.',
      )
    }
    for (const link of dom.window.document.querySelectorAll(
      'link[rel="stylesheet"]',
    )) {
      link.remove()
    }
    return dom.serialize()
  } finally {
    dom.window.close()
  }
}

// This upstream page embeds its serialization helpers. Rewrite their bodies
// through an AST so its original inputs can test selector validity instead.
export function adaptAnPlusB(source: string) {
  const dom = new JSDOM(source)
  let replaced = 0
  try {
    for (const script of dom.window.document.scripts) {
      if (script.src || !script.textContent) {
        continue
      }
      const code = script.textContent
      const ast = parse(code, { ecmaVersion: 'latest' })
      const edits: Array<{ start: number; end: number; text: string }> = []
      for (const node of ast.body) {
        if (node.type !== 'FunctionDeclaration') {
          continue
        }
        const helper =
          node.id?.name === 'assert_selector_serializes_to'
            ? 'test_valid_selector'
            : node.id?.name === 'assert_invalid_selector'
              ? 'test_invalid_selector'
              : null
        if (helper) {
          edits.push({
            start: node.body.start,
            end: node.body.end,
            text: `{ ${helper}(source); }`,
          })
        }
      }
      let result = code
      for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
        result =
          result.slice(0, edit.start) + edit.text + result.slice(edit.end)
        replaced++
      }
      script.textContent = result
    }
    if (replaced !== 2) {
      throw new Error('The upstream An+B helpers changed. Review the adapter.')
    }
    const helpers = dom.window.document.createElement('script')
    helpers.src = '/css/support/parsing-testcommon.js'
    dom.window.document.head.append(helpers)
    return dom.serialize()
  } finally {
    dom.window.close()
  }
}
