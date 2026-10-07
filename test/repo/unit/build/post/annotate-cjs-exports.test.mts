import { runInNewContext } from 'node:vm'
import { parse } from 'acorn'
import type {
  ExpressionStatement,
  LogicalExpression,
  AssignmentExpression,
  ObjectExpression,
  Property,
  Literal,
} from 'acorn'
import { expect, test } from 'vitest'
import { annotateCommonJsExports } from '../../../../../scripts/repo/build/post/annotate-cjs-exports.mts'
test('export annotations are valid unreachable code with deterministic property order', () => {
  const exports = { zeta: 1, alpha: 2 }
  const source = annotateCommonJsExports(exports)
  const ast = parse(source, { ecmaVersion: 'latest' })
  const context = { module: { exports } }
  runInNewContext(source, context)
  expect(context.module.exports).toBe(exports)
  expect(ast.body).toHaveLength(1)
  const statement = ast.body[0] as ExpressionStatement
  const logical = statement.expression as LogicalExpression
  const assignment = logical.right as AssignmentExpression
  const object = assignment.right as ObjectExpression
  expect(
    object.properties.map(
      property => ((property as Property).key as Literal).value,
    ),
  ).toEqual(['alpha', 'zeta'])
})
