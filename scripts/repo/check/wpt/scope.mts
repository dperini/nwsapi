import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { parse } from 'acorn'
import type { AnyNode } from 'acorn'
import { JSDOM } from 'jsdom'
import { manifest } from '../../../../test/repo/e2e/upstream/manifest.mts'
import type { WptEntry } from '../../../../test/repo/e2e/upstream/manifest.mts'
import { pageContentType, pageSource, walkAst, wptFile } from './source.mts'
import { REPO_ROOT } from '../../lib/paths.mts'
import { isMainModule } from '../../lib/run-node.mts'

export interface ScopeIssue {
  file: string
  line: number
  reason: string
}

const rendering = new Set([
  'getComputedStyle',
  'computedStyleMap',
  'getBoundingClientRect',
  'getClientRects',
  'offsetWidth',
  'offsetHeight',
  'offsetTop',
  'offsetLeft',
  'clientWidth',
  'clientHeight',
  'clientTop',
  'clientLeft',
  'scrollWidth',
  'scrollHeight',
  'getImageData',
  'toDataURL',
])
const outsideScope = new Set([
  'styleSheets',
  'adoptedStyleSheets',
  'cssRules',
  'selectorText',
  'insertRule',
  'addRule',
  'CSSStyleSheet',
  'test_driver',
  'test_driver_internal',
  'assert_styles',
  'assert_style',
  'checkLayout',
  'checkLayoutAsync',
])
const selectorMethods = new Set([
  'querySelector',
  'querySelectorAll',
  'matches',
  'closest',
  'select',
  'first',
  'match',
  'compile',
])
const harnessScripts = new Set([
  '/resources/testharness.js',
  '/resources/testharnessreport.js',
])

export function staticName(node: AnyNode): string | undefined {
  if (node.type === 'Identifier') {
    return node.name
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined
  }
  return undefined
}

export function discardedRead(node: AnyNode, ancestors: AnyNode[]) {
  for (const parent of ancestors.toReversed()) {
    if (parent.type === 'ExpressionStatement') {
      return true
    }
    if (
      !(parent.type === 'MemberExpression' && parent.object === node) &&
      !(parent.type === 'CallExpression' && parent.callee === node) &&
      parent.type !== 'ChainExpression' &&
      !(parent.type === 'UnaryExpression' && parent.operator === 'void')
    ) {
      return false
    }
    node = parent
  }
  return false
}

export function inspectScript(source: string, file: string, module = false) {
  const issues: ScopeIssue[] = []
  const imports: string[] = []
  let selectors = 0
  let ast
  try {
    if (file.endsWith('.mts')) {
      source = stripTypeScriptTypes(source)
    }
    ast = parse(source, {
      ecmaVersion: 'latest',
      sourceType: module ? 'module' : 'script',
      locations: true,
    })
  } catch (cause) {
    throw new Error(`Cannot inspect WPT script ${file}: ${String(cause)}`, {
      cause,
    })
  }
  // oxlint-disable-next-line eslint/complexity -- Inspect supported AST shapes in one pass without evaluating upstream code.
  walkAst(ast, (node, ancestors) => {
    const parent = ancestors.at(-1)
    const name =
      node.type === 'MemberExpression'
        ? staticName(node.property)
        : node.type === 'Property' && parent?.type === 'ObjectPattern'
          ? staticName(node.key)
          : node.type === 'Identifier' &&
              !(
                parent?.type === 'MemberExpression' && parent.property === node
              ) &&
              !(parent?.type === 'Property' && parent.key === node)
            ? node.name
            : undefined
    if (
      name &&
      (outsideScope.has(name) ||
        (rendering.has(name) && !discardedRead(node, ancestors)))
    ) {
      issues.push({
        file,
        line: node.loc!.start.line,
        reason: `${name} reads rendering or CSSOM results, or requires testdriver.`,
      })
    }
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression'
    ) {
      if (selectorMethods.has(staticName(node.callee.property) || '')) {
        selectors++
      }
      if (
        staticName(node.callee.property) === 'createElement' &&
        node.arguments[0]?.type === 'Literal' &&
        node.arguments[0].value === 'script'
      ) {
        issues.push({
          file,
          line: node.loc!.start.line,
          reason:
            'Use a static script dependency so the scope check can inspect it.',
        })
      }
    }
    if (
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'ExportNamedDeclaration'
    ) {
      if (node.source && typeof node.source.value === 'string') {
        imports.push(node.source.value)
      }
    } else if (node.type === 'ImportExpression') {
      const dependency = staticName(node.source)
      if (node.source.type !== 'Identifier' && dependency) {
        imports.push(dependency)
      } else {
        issues.push({
          file,
          line: node.loc!.start.line,
          reason: 'Dynamic module paths cannot be inspected.',
        })
      }
    }
  })
  return { issues, imports, selectors }
}

export function resourceUrl(relative: string, parent: string) {
  const url = new URL(relative, new URL(parent, 'http://wpt.test'))
  if (url.origin !== 'http://wpt.test') {
    throw new Error(`External WPT script needs review: ${url.href}`)
  }
  return url.pathname
}

export function inspectWptScope(
  entries: WptEntry[] = manifest,
  root = REPO_ROOT,
) {
  const issues: ScopeIssue[] = []
  const scripts = new Map<string, ReturnType<typeof inspectScript>>()
  for (const entry of entries) {
    let selectors = 0
    let harness = false
    const seen = new Set<string>()
    const inspectDependency = (url: string, module = false) => {
      if (url === '/resources/testharness.js') {
        harness = true
      }
      if (harnessScripts.has(url)) {
        return
      }
      if (url.includes('testdriver')) {
        issues.push({
          file: entry.path,
          line: 1,
          reason: `testdriver dependency: ${url}`,
        })
        return
      }
      const key = `${entry.parsing ? 'parsing:' : ''}${module ? 'module:' : ''}${url}`
      if (seen.has(key)) {
        return
      }
      seen.add(key)
      let result = scripts.get(key)
      if (!result) {
        const file =
          entry.parsing && url === '/css/support/parsing-testcommon.js'
            ? wptFile(
                '/_repo/test/repo/e2e/fixture/upstream/parsing-helpers.js',
                root,
              )
            : wptFile(url, root)
        result = inspectScript(readFileSync(file, 'utf8'), url, module)
        scripts.set(key, result)
      }
      issues.push(...result.issues)
      selectors += result.selectors
      for (const dependency of result.imports) {
        inspectDependency(resourceUrl(dependency, url), true)
      }
    }
    // oxlint-disable-next-line eslint/complexity -- Keep scripts, handlers, and nested fixtures under the same page context.
    const inspectHtml = (source: string, url: string, fixture = false) => {
      const dom = new JSDOM(source, { contentType: pageContentType(url) })
      try {
        const document = dom.window.document
        if (!fixture) {
          for (const link of document.getElementsByTagName('link')) {
            if (
              link.relList.contains('match') ||
              link.relList.contains('mismatch')
            ) {
              issues.push({
                file: url,
                line: 1,
                reason: 'Reftests require rendering comparison.',
              })
            }
          }
        }
        let index = 0
        for (const element of document.getElementsByTagName('*')) {
          for (const attribute of element.attributes) {
            if (attribute.name.toLowerCase().startsWith('on')) {
              const result = inspectScript(
                `function handler(event) {\n${attribute.value}\n}`,
                `${url}#${attribute.name}`,
              )
              issues.push(...result.issues)
              selectors += result.selectors
              for (const dependency of result.imports) {
                inspectDependency(resourceUrl(dependency, url), true)
              }
            }
          }
        }
        for (const script of document.getElementsByTagName('script')) {
          index++
          const type = script.getAttribute('type') || ''
          if (
            type &&
            !['module', 'text/javascript', 'application/javascript'].includes(
              type,
            )
          ) {
            continue
          }
          const src = script.getAttribute('src')
          if (src) {
            inspectDependency(resourceUrl(src, url), type === 'module')
          } else {
            const result = inspectScript(
              script.textContent || '',
              `${url}#script-${index}`,
              type === 'module',
            )
            issues.push(...result.issues)
            selectors += result.selectors
            for (const dependency of result.imports) {
              inspectDependency(resourceUrl(dependency, url), true)
            }
          }
        }
        for (const frame of document.getElementsByTagName('iframe')) {
          const srcdoc = frame.getAttribute('srcdoc')
          if (srcdoc !== null) {
            inspectHtml(srcdoc, url, true)
            continue
          }
          const src = frame.getAttribute('src')
          if (src && src !== 'about:blank') {
            const target = resourceUrl(src, url)
            if (!seen.has(target)) {
              seen.add(target)
              inspectHtml(
                readFileSync(wptFile(target, root), 'utf8'),
                target,
                true,
              )
            }
          }
        }
      } finally {
        dom.window.close()
      }
    }
    inspectHtml(pageSource(entry, root), entry.path)
    if (!harness) {
      issues.push({
        file: entry.path,
        line: 1,
        reason: 'No testharness dependency was found.',
      })
    }
    if (!selectors) {
      issues.push({
        file: entry.path,
        line: 1,
        reason: 'No selector API calls were found in the page or its helpers.',
      })
    }
  }
  return { pages: entries.length, scripts: scripts.size, issues }
}

export function checkWptScope() {
  const result = inspectWptScope()
  if (result.issues.length) {
    throw new Error(
      result.issues
        .map(issue => `${issue.file}:${issue.line}: ${issue.reason}`)
        .join('\n'),
    )
  }
  console.log(
    `WPT scope: ${result.pages} pages and ${result.scripts} shared scripts passed the rendering-scope check.`,
  )
  return result
}

export default function setup() {
  checkWptScope()
}

if (isMainModule(import.meta.url)) {
  if (process.argv.length > 2) {
    throw new Error('Usage: node scripts/repo/check/wpt/scope.mts')
  }
  checkWptScope()
}
