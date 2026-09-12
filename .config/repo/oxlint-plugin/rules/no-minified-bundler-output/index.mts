// Adapted from Wheelhouse. See docs/repo/style/configuration.md.
function normalizePath(value: string) {
  return value.replaceAll('\\', '/')
}

import type { AstNode, RuleContext, RuleFixer } from '../../lib/rule-types.mts'

// Core bundler package names. A config importing one of these, or a subpath, is
// a bundler config. Plugins (`@rollup/plugin-*`, `rollup-plugin-*`) are NOT in
// the set — importing a plugin doesn't make a file the bundler config itself.
const BUNDLER_PACKAGES = ['esbuild', 'rolldown', 'rollup', 'vite', 'webpack']

// `<bundler>.config.<ext>` (e.g. `rolldown.config.mts`, `vite.config.ts`,
// `webpack.config.js`) — covers webpack/esbuild configs that don't import the
// bundler. Anchored to a path segment so it can't match mid-word.
const BUNDLER_CONFIG_FILENAME_RE =
  /(?:^|\/)(?:esbuild|rolldown|rollup|vite|webpack)[.-][^/]*config[^/]*\.[cm]?[jt]sx?$/i

// A path inside a `rolldown/` directory — the fleet keeps its rolldown configs
// under `.config/repo/rolldown/`, per-repo opt-in bundler configs, and
// `.config/fleet/rolldown/`, the mandatory hook-bundle config; neither has a
// bundler token in its basename, so this signal covers both tiers.
const ROLLDOWN_DIR_RE = /\/rolldown\//

function isBundlerImportSource(source: string): boolean {
  for (let i = 0, { length } = BUNDLER_PACKAGES; i < length; i += 1) {
    const pkg = BUNDLER_PACKAGES[i]!
    if (source === pkg || source.startsWith(`${pkg}/`)) {
      return true
    }
  }
  return false
}

function keyName(node: AstNode): string | undefined {
  const key = 'key' in node ? node.key : undefined
  if (!key) {
    return undefined
  }
  if (key.type === 'Identifier') {
    return key.name
  }
  if (key.type === 'Literal' && typeof key.value === 'string') {
    return key.value
  }
  return undefined
}

// `minify: false` is the compliant state. `true`, an options object, or a
// non-empty string (vite's `'esbuild'` / `'terser'`) all mean "minifying".
function isMinifying(valueNode: AstNode): boolean {
  if (!valueNode) {
    return false
  }
  if (valueNode.type === 'ObjectExpression') {
    return true
  }
  if (valueNode.type === 'Literal') {
    if (valueNode.value === true) {
      return true
    }
    return typeof valueNode.value === 'string' && valueNode.value !== ''
  }
  return false
}

// `sourcemap: false` is compliant. `true`, an options object, or a source-map
// mode string (`'inline'` / `'external'` / `'both'` / `'hidden'`) emit maps.
function isSourcemapEnabled(valueNode: AstNode): boolean {
  if (!valueNode) {
    return false
  }
  if (valueNode.type === 'ObjectExpression') {
    return true
  }
  if (valueNode.type === 'Literal') {
    if (valueNode.value === true) {
      return true
    }
    return (
      typeof valueNode.value === 'string' &&
      valueNode.value !== '' &&
      valueNode.value !== 'none'
    )
  }
  return false
}

// webpack `devtool` — `false` disables source maps; any non-false string
// (`'source-map'`, `'eval'`, …) or `true` enables them.
function isDevtoolEnabled(valueNode: AstNode): boolean {
  if (!valueNode || valueNode.type !== 'Literal') {
    return false
  }
  if (valueNode.value === false) {
    return false
  }
  if (valueNode.value === true) {
    return true
  }
  return (
    typeof valueNode.value === 'string' &&
    valueNode.value !== '' &&
    valueNode.value !== 'none'
  )
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Bundler output must not be minified and must not emit source maps (fleet hard rule). Applies to rolldown / esbuild / rollup / vite / webpack configs.',
      category: 'Possible Errors',
      recommended: true,
    },
    fixable: 'code',
    messages: {
      noMinify:
        'Bundler output must not be minified (fleet hard rule); set to `false`.',
      noSourcemap:
        'Bundler output must not emit source maps (fleet hard rule); set to `false`.',
    },
    schema: [],
  },

  create(context: RuleContext) {
    const filename = normalizePath(
      context.filename ?? context.getFilename?.() ?? '',
    )
    let hasBundlerSignal =
      BUNDLER_CONFIG_FILENAME_RE.test(filename) ||
      ROLLDOWN_DIR_RE.test(filename)

    // Collected so reporting waits for `Program:exit` — a `minify`/`sourcemap`
    // property could be visited before the import that proves this is a bundler
    // config, in practice imports lead, but collecting is order-independent.
    const violations: Array<{ node: AstNode; messageId: string }> = []

    function consider(node: AstNode<'Property'>): void {
      const name = keyName(node)
      if (name === 'minify' && isMinifying(node.value)) {
        violations.push({ node: node.value, messageId: 'noMinify' })
      } else if (
        name === 'minimize' &&
        node.value?.type === 'Literal' &&
        node.value.value === true
      ) {
        violations.push({ node: node.value, messageId: 'noMinify' })
      } else if (name === 'sourcemap' && isSourcemapEnabled(node.value)) {
        violations.push({ node: node.value, messageId: 'noSourcemap' })
      } else if (name === 'devtool' && isDevtoolEnabled(node.value)) {
        violations.push({ node: node.value, messageId: 'noSourcemap' })
      }
    }

    return {
      ImportDeclaration(node: AstNode<'ImportDeclaration'>) {
        const source = node.source
        if (
          source?.type === 'Literal' &&
          typeof source.value === 'string' &&
          isBundlerImportSource(source.value)
        ) {
          hasBundlerSignal = true
        }
      },
      Property(node: AstNode<'Property'>) {
        consider(node)
      },
      'Program:exit'() {
        if (!hasBundlerSignal) {
          return
        }
        for (let i = 0, { length } = violations; i < length; i += 1) {
          const v = violations[i]!
          context.report({
            node: v.node,
            messageId: v.messageId,
            fix(fixer: RuleFixer) {
              return fixer.replaceText(v.node, 'false')
            },
          })
        }
      },
    }
  },
}

// Oxlint plugin contract requires default-exported rule object.
export default rule
