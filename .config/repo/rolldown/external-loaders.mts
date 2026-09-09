import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'
import type { Expression } from 'acorn'
import type { Plugin } from 'rolldown'

function defaultRequire(node: Expression) {
  if (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === 'default' &&
    node.object.type === 'CallExpression' &&
    node.object.callee.type === 'Identifier' &&
    node.object.callee.name === 'require' &&
    node.object.arguments.length === 1 &&
    node.object.arguments[0]?.type === 'Literal' &&
    typeof node.object.arguments[0].value === 'string' &&
    node.object.arguments[0].value.endsWith('.mjs')
  ) {
    return node.object.arguments[0].value
  }
  throw new Error('External loader must require an ESM default export')
}

export function rewriteExternalExports(code: string) {
  const program = parse(code, { ecmaVersion: 'latest', sourceType: 'script' })
  return program.body
    .map(statement => {
      if (statement.type === 'ExpressionStatement') {
        if (statement.directive === 'use strict') {
          return code.slice(statement.start, statement.end)
        }
        const expression = statement.expression
        if (
          expression.type === 'AssignmentExpression' &&
          expression.operator === '='
        ) {
          const { left, right } = expression
          if (
            left.type === 'MemberExpression' &&
            !left.computed &&
            left.object.type === 'Identifier' &&
            left.object.name === 'exports' &&
            left.property.type === 'Identifier'
          ) {
            return `export { default as ${left.property.name} } from ${JSON.stringify(defaultRequire(right))}`
          }
        }
      }
      throw new Error('External loader must contain only static exports')
    })
    .join('\n')
}

// This immutable loader has no cycles or mutable exports. Expose its imports
// to Rolldown while keeping the source file usable as CommonJS.
export function externalLoaderPlugin(): Plugin {
  const file = fileURLToPath(
    new URL('../../../src/external/unicode.js', import.meta.url),
  )
  return {
    name: 'bundle-static-external-loaders',
    transform: {
      filter: { id: [file] },
      handler(code) {
        return { code: rewriteExternalExports(code), map: null }
      },
    },
  }
}
