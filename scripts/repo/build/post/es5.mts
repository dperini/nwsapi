import { transform } from '@swc/core'
import { parse } from 'acorn'
import packageJson from '../../../../package.json' with { type: 'json' }

// Lower syntax after bundling so every browser byte has the same ES5 target.
export async function lowerToEs5(code: string) {
  const result = await transform(code, {
    swcrc: false,
    configFile: false,
    isModule: false,
    minify: false,
    sourceMaps: false,
    env: {
      targets: packageJson.browserslist,
      // Preserve native operators and avoid adding callback names for old hosts.
      // These transforms emulate Symbol polyfills and Function.name, not syntax.
      exclude: [
        'transform-typeof-symbol',
        'transform-instanceof',
        'transform-function-name',
      ],
    },
    jsc: {
      parser: { syntax: 'ecmascript' },
      externalHelpers: false,
    },
  })
  parse(result.code, { ecmaVersion: 5, sourceType: 'script' })
  return result.code
}
