import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { parse } from 'acorn'
import { parse as parseHtml } from 'parse5'
import type { DefaultTreeAdapterTypes } from 'parse5'
import { REPO_ROOT } from '../../lib/paths.mts'
import { isMainModule } from '../../lib/run-node.mts'
import { walkAst } from './source.mts'
import { staticName } from './scope.mts'

const inventoryPath = path.join(
  REPO_ROOT,
  'test/repo/e2e/upstream/inventory.json',
)
const methods = new Set([
  'querySelector',
  'querySelectorAll',
  'matches',
  'closest',
])
const helpers = new Set([
  'test_valid_selector',
  'test_invalid_selector',
  'test_valid_forgiving_selector',
])

export function inspectSelectorCalls(source: string, html: boolean) {
  const scripts: string[] = []
  let harness = !html && /\b(?:test|promise_test|async_test)\s*\(/.test(source)
  let testdriver = false
  if (html) {
    const visit = (node: DefaultTreeAdapterTypes.Node) => {
      if ('tagName' in node && node.tagName === 'script') {
        const src = node.attrs.find(
          attribute => attribute.name === 'src',
        )?.value
        if (src) {
          harness ||= src.includes('testharness.js')
          testdriver ||= src.includes('testdriver')
        } else {
          scripts.push(
            node.childNodes
              .map(child => ('value' in child ? child.value : ''))
              .join(''),
          )
        }
      }
      if ('childNodes' in node) {
        for (const child of node.childNodes) {
          visit(child)
        }
      }
    }
    visit(parseHtml(source))
  } else {
    scripts.push(source)
  }
  const calls: Record<string, number> = {}
  let assertions = 0
  let validity = 0
  let unparsed = 0
  for (const script of scripts) {
    let ast
    try {
      ast = parse(script, { ecmaVersion: 'latest', sourceType: 'module' })
    } catch {
      unparsed++
      continue
    }
    walkAst(ast, (node, ancestors) => {
      if (node.type !== 'CallExpression') {
        return
      }
      if (node.callee.type === 'Identifier' && helpers.has(node.callee.name)) {
        validity++
      }
      if (node.callee.type !== 'MemberExpression') {
        return
      }
      const name = staticName(node.callee.property)
      if (!name || !methods.has(name)) {
        return
      }
      calls[name] = (calls[name] || 0) + 1
      // This flags assertion candidates. A query used to obtain a node for a
      // style or unrelated API assertion still needs manual review.
      if (
        ancestors.some(
          parent =>
            parent.type === 'CallExpression' &&
            parent.callee.type === 'Identifier' &&
            parent.callee.name.startsWith('assert_'),
        )
      ) {
        assertions++
      }
    })
  }
  return { harness, testdriver, calls, assertions, validity, unparsed }
}

export function inventoryRevision() {
  return execFileSync(
    'git',
    ['-C', path.join(REPO_ROOT, 'upstream/wpt'), 'rev-parse', 'HEAD'],
    { encoding: 'utf8' },
  ).trim()
}

export function scanInventory(sourceRoot: string) {
  const revision = inventoryRevision()
  const tree = execFileSync(
    'git',
    ['-C', path.join(REPO_ROOT, 'upstream/wpt'), 'ls-tree', '-rz', revision],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  const candidates = []
  let scanned = 0
  for (const entry of tree.split('\0')) {
    if (!entry) {
      continue
    }
    const tab = entry.indexOf('\t')
    const [mode, , object] = entry.slice(0, tab).split(' ')
    const file = entry.slice(tab + 1)
    if (mode === '120000' || !/\.(?:html|xhtml|xht|xml|js|mjs)$/.test(file)) {
      continue
    }
    const bytes = readFileSync(path.join(sourceRoot, file))
    const hash = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex')
    if (hash !== object) {
      throw new Error(
        `Full WPT source does not match the pinned Git tree: ${file}`,
      )
    }
    scanned++
    const source = bytes.toString('utf8')
    // Text is a discovery prefilter only. Comments and strings cannot count as
    // selector calls because the recorded call counts come from parsed ASTs.
    if (
      !/\b(?:querySelector|querySelectorAll|matches|closest|test_valid_selector|test_invalid_selector|test_valid_forgiving_selector|selectorText)\b/.test(
        source,
      ) &&
      !source.includes('selector(')
    ) {
      continue
    }
    const result = inspectSelectorCalls(source, !/\.(?:js|mjs)$/.test(file))
    candidates.push({ path: '/' + file, blob: object, ...result })
  }
  return { revision, scanned, candidates }
}

export function checkInventory() {
  const report = JSON.parse(readFileSync(inventoryPath, 'utf8')) as {
    revision: string
    scanned: number
    candidates: unknown[]
  }
  if (report.revision !== inventoryRevision()) {
    throw new Error(
      'The WPT pin changed. Rebuild the full-tree selector inventory and review new parsing and matching candidates before accepting the update.',
    )
  }
  console.log(
    `Full WPT inventory: ${report.scanned} source files, ${report.candidates.length} discovery candidates at the pinned revision.`,
  )
  return report
}

export function fetchInventory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-wpt-inventory-'))
  try {
    const archive = path.join(directory, 'wpt.tar.gz')
    const source = path.join(directory, 'source')
    mkdirSync(source)
    execFileSync(
      'curl',
      [
        '--fail',
        '--location',
        '--silent',
        '--show-error',
        `https://codeload.github.com/web-platform-tests/wpt/tar.gz/${inventoryRevision()}`,
        '--output',
        archive,
      ],
      { stdio: 'inherit' },
    )
    execFileSync(
      'tar',
      ['-xzf', archive, '--strip-components=1', '-C', source],
      { stdio: 'inherit' },
    )
    return scanInventory(source)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

if (isMainModule(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      source: { type: 'string' },
      write: { type: 'boolean' },
      fetch: { type: 'boolean' },
    },
  })
  if (values.write) {
    if ((!values.source && !values.fetch) || (values.source && values.fetch)) {
      throw new Error(
        'Usage: check:wpt-inventory (--source /path/to/full/pinned/wpt | --fetch) --write',
      )
    }
    const report = values.fetch
      ? fetchInventory()
      : scanInventory(path.resolve(values.source!))
    writeFileSync(inventoryPath, JSON.stringify(report) + '\n')
  } else if (values.source || values.fetch) {
    throw new Error('--source and --fetch require --write')
  }
  checkInventory()
}
