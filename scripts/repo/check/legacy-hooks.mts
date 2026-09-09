import { parse } from 'acorn'
import type {
  Node,
  VariableDeclarator,
  FunctionDeclaration,
  FunctionExpression,
} from 'acorn'

const implementations = new Set([
  'LEGACY_NAMES',
  'LEGACY_URLS',
  'LEGACY_URL_READ',
  'LEGACY_PROBE',
  'H_USED',
  'createLegacyCache',
  'probeAttributes',
  'detectLegacy',
  'legacyAttrNode',
  'legacyAttrOf',
  'legacyHasAttrOf',
  'legacyTagOf',
  'legacyIdOf',
  'legacyClassOf',
  'legacyUpOf',
  'legacyNextOf',
  'legacyPrevOf',
  'legacyFirstOf',
  'legacyAttrNamesOf',
  'legacyConnectedOf',
  'legacyMatcher',
  'readHelped',
  'helpReads',
])

function bindings(source: string) {
  const names = new Set<string>()
  function visit(node: Node) {
    if (
      node.type === 'VariableDeclarator' ||
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression'
    ) {
      const binding = (
        node as VariableDeclarator | FunctionDeclaration | FunctionExpression
      ).id
      if (binding?.type === 'Identifier') {
        names.add(binding.name)
      }
    }
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (
          child &&
          typeof child === 'object' &&
          typeof child.type === 'string'
        ) {
          visit(child as Node)
        }
      }
    }
  }
  visit(parse(source, { ecmaVersion: 'latest', sourceType: 'script' }))
  return names
}

export function checkLegacyHooks(core: string, legacy: string) {
  const coreNames = bindings(core)
  const moduleNames = bindings(legacy)
  for (const name of implementations) {
    if (coreNames.has(name)) {
      throw new Error(`Legacy implementation remains in the core: ${name}`)
    }
  }
  for (const name of [
    'createLegacyHooks',
    'createLegacyCache',
    'legacyAttrOf',
    'helpReads',
  ]) {
    if (!moduleNames.has(name)) {
      throw new Error(`Missing legacy module implementation: ${name}`)
    }
  }
  for (const name of ['Factory', 'compileSelector', 'unicodeDirection']) {
    if (moduleNames.has(name)) {
      throw new Error(`The legacy module duplicates the engine: ${name}`)
    }
  }
}
