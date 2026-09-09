import { parse } from 'acorn'
import { build } from 'rolldown'

// Keep the UMD wrapper outside bundling. Treating it as CommonJS changes its
// browser and AMD branches. Only the engine factory needs tree shaking.
export async function bundleEngine(source: string) {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'script' })
  const statement = program.body.find(
    node =>
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.type === 'FunctionExpression' &&
      node.expression.callee.id?.name === 'Export',
  )
  if (
    statement?.type !== 'ExpressionStatement' ||
    statement.expression.type !== 'CallExpression'
  ) {
    throw new Error('Missing engine UMD wrapper')
  }
  const factory = statement.expression.arguments[1]
  if (
    factory?.type !== 'FunctionExpression' ||
    factory.id?.name !== 'Factory'
  ) {
    throw new Error('Missing engine factory')
  }
  const result = await build({
    input: 'nwsapi:factory',
    platform: 'browser',
    write: false,
    plugins: [
      {
        name: 'nwsapi-factory',
        resolveId(id) {
          return id === 'nwsapi:factory' ? id : null
        },
        load(id) {
          return id === 'nwsapi:factory'
            ? `export default ${source.slice(factory.start, factory.end)}`
            : null
        },
      },
    ],
    output: {
      format: 'iife',
      name: 'nwsapiFactory',
      exports: 'default',
      minify: false,
    },
  })
  const output = result.output[0]
  if (output?.type !== 'chunk') {
    throw new Error('Missing bundled engine factory')
  }
  return (
    source.slice(0, factory.start) +
    `(function () {\n${output.code}\nreturn nwsapiFactory;\n})()` +
    source.slice(factory.end)
  )
}
