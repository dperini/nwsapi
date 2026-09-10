import { JSDOM } from 'jsdom'
import { execFileSync } from 'node:child_process'
import { parse } from 'acorn'
import { parse as parseHtml, type DefaultTreeAdapterTypes } from 'parse5'
import { walkAst } from './source.mts'

export function parseNativeScript(source: string) {
  // WPT server placeholders are metadata. Use a neutral scalar for static analysis,
  // preserving the surrounding API calls without evaluating request values.
  const text = source.replace(/\{\{[^{}]*\}\}/g, () => '0')
  try {
    return parse(text, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true,
    })
  } catch {
    return parse(text, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
  }
}

export function verifyNativeCheckout(checkout: string, revision: string) {
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim()
  if (
    git('rev-parse', 'HEAD') !== revision ||
    git('status', '--porcelain', '--untracked-files=no')
  ) {
    throw new Error(
      'Native analysis requires pristine sources at the report revision.',
    )
  }
}

// oxlint-disable-next-line eslint/complexity -- Read the distinct HTML, XML, and JavaScript metadata formats without executing tests.
export function pageMetadata(source: string, file: string) {
  const scripts: string[] = []
  const dependencies: string[] = []
  const help: string[] = []
  const flags: string[] = []
  const frames: string[] = []
  const embeddedScripts: string[] = []
  let forwardsTests = false
  let title = ''
  if (file.endsWith('.js') || file.endsWith('.mjs')) {
    scripts.push(source)
    for (const line of source.split('\n')) {
      const match = /^\s*\/\/\s*META:\s*script=(.+)$/.exec(line)
      if (match) {
        dependencies.push(match[1]!.trim())
      }
    }
  } else if (
    ['.xht', '.xhtml', '.xml', '.svg'].some(extension =>
      file.endsWith(extension),
    )
  ) {
    const dom = new JSDOM(source, { contentType: 'application/xhtml+xml' })
    try {
      for (const element of dom.window.document.getElementsByTagName('*')) {
        const name = element.localName
        if (name === 'script') {
          const src = element.getAttribute('src')
          if (src) {
            dependencies.push(src)
          } else {
            scripts.push(element.textContent || '')
          }
        }
        if (name === 'link' && element.getAttribute('rel') === 'help') {
          help.push(element.getAttribute('href') || '')
        }
        if (name === 'title') {
          title = element.textContent || ''
        }
      }
    } finally {
      dom.window.close()
    }
  } else {
    // oxlint-disable-next-line eslint/complexity -- HTML metadata shares one traversal for scripts, frames, labels, and titles.
    const visit = (node: DefaultTreeAdapterTypes.Node) => {
      if ('tagName' in node) {
        const attrs = Object.fromEntries(
          node.attrs.map(attr => [attr.name, attr.value]),
        )
        const text = node.childNodes
          .map(child => ('value' in child ? child.value : ''))
          .join('')
        if (node.tagName === 'iframe' && attrs['src']) {
          frames.push(attrs['src'])
        }
        if (node.tagName === 'script') {
          if (attrs['src']) {
            dependencies.push(attrs['src'])
          } else if (
            !attrs['type'] ||
            ['module', 'text/javascript', 'application/javascript'].includes(
              attrs['type'],
            )
          ) {
            scripts.push(text)
          }
        }
        if (
          node.tagName === 'link' &&
          attrs['rel']?.split(/\s+/).includes('help') &&
          attrs['href']
        ) {
          help.push(attrs['href'])
        }
        if (node.tagName === 'meta' && attrs['name'] === 'flags') {
          flags.push(...(attrs['content'] || '').split(/\s+/))
        }
        if (node.tagName === 'title') {
          title = text
        }
      }
      if ('childNodes' in node) {
        node.childNodes.forEach(visit)
      }
    }
    visit(parseHtml(source))
  }
  for (const script of scripts) {
    try {
      const ast = parseNativeScript(script)
      const scriptNodes = new Set<string>()
      const scriptTypes = new Map<string, string>()
      const frameNodes = new Set<string>()
      // oxlint-disable-next-line eslint/complexity -- Resolve only explicit script nodes and literal dependency paths from AST nodes.
      walkAst(ast, node => {
        if (
          node.type === 'AssignmentExpression' &&
          node.left.type === 'MemberExpression' &&
          node.left.object.type === 'Identifier' &&
          node.left.property.type === 'Identifier' &&
          node.left.property.name === 'type' &&
          node.right.type === 'Literal' &&
          typeof node.right.value === 'string'
        ) {
          scriptTypes.set(node.left.object.name, node.right.value)
        }
        if (
          node.type === 'VariableDeclarator' &&
          node.id.type === 'Identifier' &&
          node.init?.type === 'CallExpression' &&
          node.init.callee.type === 'MemberExpression' &&
          node.init.callee.property.type === 'Identifier' &&
          ['createElement', 'querySelector'].includes(
            node.init.callee.property.name,
          ) &&
          node.init.arguments[0]?.type === 'Literal' &&
          node.init.arguments[0].value === 'iframe'
        ) {
          frameNodes.add(node.id.name)
        }
        if (
          node.type === 'VariableDeclarator' &&
          node.id.type === 'Identifier' &&
          node.init?.type === 'CallExpression' &&
          node.init.callee.type === 'MemberExpression' &&
          node.init.callee.property.type === 'Identifier' &&
          node.init.callee.property.name === 'createElement' &&
          node.init.arguments[0]?.type === 'Literal' &&
          node.init.arguments[0].value === 'script'
        ) {
          scriptNodes.add(node.id.name)
        }
      })
      // oxlint-disable-next-line eslint/complexity -- Resolve only explicit script nodes and literal dependency paths from AST nodes.
      walkAst(ast, node => {
        if (
          node.type === 'AssignmentExpression' &&
          node.left.type === 'MemberExpression' &&
          node.left.object.type === 'Identifier' &&
          scriptNodes.has(node.left.object.name) &&
          ['', 'module', 'text/javascript', 'application/javascript'].includes(
            scriptTypes.get(node.left.object.name) || '',
          ) &&
          node.left.property.type === 'Identifier' &&
          ['innerHTML', 'text', 'textContent'].includes(node.left.property.name)
        ) {
          if (
            node.right.type === 'Literal' &&
            typeof node.right.value === 'string'
          ) {
            scripts.push(node.right.value)
          } else if (
            node.right.type === 'TemplateLiteral' &&
            !node.right.expressions.length
          ) {
            scripts.push(node.right.quasis[0]!.value.cooked || '')
          }
        }
        if (
          node.type === 'CallExpression' &&
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'addEventListener' &&
          node.arguments[0]?.type === 'Literal' &&
          node.arguments[0].value === 'message'
        ) {
          forwardsTests = true
        }
        if (
          node.type === 'AssignmentExpression' &&
          node.left.type === 'MemberExpression' &&
          node.left.object.type === 'Identifier' &&
          frameNodes.has(node.left.object.name) &&
          node.left.property.type === 'Identifier' &&
          node.left.property.name === 'src' &&
          node.right.type === 'Literal' &&
          typeof node.right.value === 'string'
        ) {
          frames.push(node.right.value)
        }
        if (
          node.type === 'AssignmentExpression' &&
          node.left.type === 'MemberExpression' &&
          node.left.object.type === 'Identifier' &&
          scriptNodes.has(node.left.object.name) &&
          node.left.property.type === 'Identifier' &&
          node.left.property.name === 'src' &&
          node.right.type === 'Literal' &&
          typeof node.right.value === 'string'
        ) {
          dependencies.push(node.right.value)
        }
        if (
          node.type === 'CallExpression' &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'fetch_tests_from_window'
        ) {
          forwardsTests = true
        }
        if (
          node.type === 'ArrayExpression' &&
          node.elements.length &&
          node.elements.every(
            item =>
              item?.type === 'Literal' &&
              typeof item.value === 'string' &&
              item.value.endsWith('.js'),
          )
        ) {
          for (const item of node.elements) {
            if (item?.type === 'Literal' && typeof item.value === 'string') {
              embeddedScripts.push(item.value)
            }
          }
        }
        if (
          node.type === 'ImportDeclaration' &&
          typeof node.source.value === 'string'
        ) {
          dependencies.push(node.source.value)
        }
        if (
          node.type === 'CallExpression' &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'importScripts'
        ) {
          for (const arg of node.arguments) {
            if (arg.type === 'Literal' && typeof arg.value === 'string') {
              dependencies.push(arg.value)
            }
          }
        }
      })
    } catch {
      /* The inference pass records parse failures with source evidence. */
    }
  }
  if (forwardsTests) {
    dependencies.push(...frames, ...embeddedScripts)
  }
  return {
    scripts,
    dependencies: [...new Set(dependencies)],
    help,
    flags,
    title,
  }
}

export function manifestSources(items: Record<string, unknown>) {
  const sources = new Map<string, string>()
  const visit = (node: unknown, parts: string[]) => {
    if (Array.isArray(node)) {
      for (const variant of node.slice(1)) {
        if (Array.isArray(variant)) {
          sources.set(
            '/' + String(variant[0] || parts.join('/')).replace(/^\//, ''),
            parts.join('/'),
          )
        }
      }
    } else if (node && typeof node === 'object') {
      for (const [name, child] of Object.entries(node)) {
        visit(child, [...parts, name])
      }
    }
  }
  for (const tree of Object.values(items)) {
    visit(tree, [])
  }
  return sources
}
