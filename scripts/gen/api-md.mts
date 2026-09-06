import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { parse } from 'acorn'
import type {
  Node,
  VariableDeclaration,
  FunctionDeclaration,
  AssignmentExpression,
  ObjectExpression,
  Property,
  ClassDeclaration,
  MethodDefinition,
  FunctionExpression,
} from 'acorn'
import {
  API_DOC_PATH,
  ENGINE_SOURCE_PATH,
  ADAPTER_SOURCE_PATH,
  TRAVERSAL_SOURCE_PATH,
} from '../lib/paths.mts'
import { isMainModule } from '../lib/run-node.mts'

const descriptions: Record<string, string> = {
  byClass: 'Returns elements with the class name.',
  byId: 'Returns elements with the ID. Duplicate IDs are allowed by default.',
  byTag: 'Returns elements with the tag name. Use `*` for all elements.',
  closest: 'Returns the nearest match, starting with the element, or `null`.',
  first: 'Returns the first matching descendant, or `null`.',
  match: 'Returns whether the element matches.',
  select: 'Returns an array of matching descendants, or an empty array.',
  compile:
    'Compiles a selector into a resolver function. This is an advanced API.',
  configure:
    'Reads or changes options. Pass `true` as the second argument to clear compiled selectors.',
  emit: 'Reports an error using the configured error policy.',
  install:
    'Replaces native selector methods. Pass `true` to also replace collection methods.',
  uninstall: 'Restores the native methods saved by `install()`.',
  registerCombinator:
    'Adds a relationship between elements using trusted resolver code.',
  registerOperator:
    'Adds an attribute operator using a resolver with `p1`, `p2`, and `p3` fields.',
  registerSelector:
    'Adds a selector pattern and a compiler callback that returns `source` and `status`.',
  CFG: 'Contains the compiler syntax settings.',
  Config: 'Contains the active options. Use `configure()` to change them.',
  Snapshot:
    'Contains the document state and helpers used by compiled selectors.',
  Version: 'Contains the engine version string.',
  Operators: 'Contains registered attribute operators.',
  Selectors: 'Contains registered selector extensions.',
  M_BODY: 'Contains the matching resolver body template.',
  M_TEST: 'Contains the matching resolver test template.',
  N_BODY: 'Exposes the matching resolver body template.',
  N_TEST: 'Contains the alternate resolver test template.',
  S_BODY: 'Contains the selection resolver body template.',
  S_TEST: 'Contains the selection resolver test template.',
  matchLambdas: 'Caches compiled matching functions, not DOM results.',
  matchResolvers: 'Caches matching plans, not DOM results.',
  selectLambdas: 'Caches compiled selection functions, not DOM results.',
  selectResolvers: 'Caches selection plans, not DOM results.',
}
const adapterDescriptions: Record<string, string> = {
  constructor:
    'Creates the adapter. `options.idlUtils` supports jsdom implementation nodes.',
  check:
    'Returns matching stylesheet branches and their syntax tree. Loads `css-tree` on first use.',
  clear:
    'Clears compiled selectors and parsed stylesheet selectors when `clearAll` is `true`.',
  closest: 'Returns the nearest matching element, or `null`.',
  extractSubjects:
    'Returns a wildcard candidate description for stylesheet matching.',
  matches: 'Returns whether an element matches.',
  querySelector: 'Returns the first matching descendant, or `null`.',
  querySelectorAll: 'Returns matching descendants as an array.',
  supports: 'Returns whether the engine accepts a selector.',
  parse:
    'Internal helper that caches stylesheet syntax after `css-tree` is loaded.',
  run: 'Internal helper that checks nodes and applies the query error policy.',
  wrap: 'Internal helper that converts jsdom implementation nodes to public nodes.',
}
const optionDescriptions: Record<string, string> = {
  FORGIVING:
    'Allows invalid items in forgiving lists such as `:is()` and `:where()`.',
  IDS_DUPES: 'Allows duplicate IDs when finding elements.',
  LEGACY: 'Enables feature checks and fallbacks for older environments.',
  LOGERRORS: 'Logs errors when exception throwing is disabled.',
  NODE_LIST: 'Uses NodeList-style results where supported.',
  USR_EVENT:
    'Reserved compatibility flag. The core does not currently read it.',
  VERBOSITY: 'Throws exceptions for invalid selectors.',
}

function* walk(value: unknown): Generator<Node> {
  if (!value || typeof value !== 'object') {
    return
  }
  if ('type' in value && typeof value.type === 'string') {
    yield value as Node
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        yield* walk(item)
      }
    } else if (child && typeof child === 'object') {
      yield* walk(child)
    }
  }
}

export function renderApiMarkdown(
  engine: string,
  adapter: string,
  traversal = readFileSync(TRAVERSAL_SOURCE_PATH, 'utf8'),
): string {
  const source = stripTypeScriptTypes(engine)
  const nodes = [
    ...walk(parse(source, { ecmaVersion: 'latest', locations: true })),
  ]
  const factory = nodes.find(
    (node): node is FunctionExpression =>
      node.type === 'FunctionExpression' &&
      (node as FunctionExpression).id?.name === 'Factory',
  )
  if (!factory) {
    throw new Error('Missing Factory function')
  }
  const variables = new Map(
    factory.body.body
      .filter(
        (node): node is VariableDeclaration =>
          node.type === 'VariableDeclaration',
      )
      .flatMap(node => node.declarations)
      .filter(node => node.id.type === 'Identifier')
      .map(node => [
        node.id.type === 'Identifier' ? node.id.name : '',
        node.init,
      ]),
  )
  const object = (name: string) => {
    const node = variables.get(name)
    if (node?.type !== 'ObjectExpression') {
      throw new Error(`Missing ${name} export object`)
    }
    return (node as ObjectExpression).properties
      .map(prop => {
        if (prop.type !== 'Property' || prop.key.type !== 'Identifier') {
          throw new Error(`Unsupported ${name} member`)
        }
        return prop as Property & { key: { name: string } }
      })
      .toSorted((a, b) => a.key.name.localeCompare(b.key.name, 'en'))
  }
  function row(
    name: string,
    signature: string,
    summary: string | undefined,
    file: string,
    line: number,
  ) {
    if (!summary) {
      throw new Error(`Add an API description for ${name}`)
    }
    return `| [\`${signature}\`](../${file}#L${line}) | ${summary} |`
  }
  const signature = (
    name: string,
    value: Node | null | undefined,
    text: string,
  ) => {
    if (
      value?.type !== 'FunctionExpression' &&
      value?.type !== 'FunctionDeclaration'
    ) {
      return name
    }
    const fn = value as FunctionExpression
    return `${name}(${fn.params.map(param => text.slice(param.start, param.end).replace(/\s+/g, ' ')).join(', ')})`
  }
  const methods: string[] = [],
    fields: string[] = []
  for (const prop of object('Dom')) {
    const name = prop.key.name
    const value =
      prop.value.type === 'Identifier'
        ? variables.get(prop.value.name)
        : prop.value
    const target = value?.type === 'FunctionExpression' ? methods : fields
    target.push(
      row(
        name,
        signature(name, value, source),
        descriptions[name],
        'src/nwsapi.mts',
        prop.loc.start.line,
      ),
    )
  }
  const adapterSource = stripTypeScriptTypes(adapter)
  const adapterNode = [
    ...walk(parse(adapterSource, { ecmaVersion: 'latest', locations: true })),
  ].find(
    (node): node is ClassDeclaration =>
      node.type === 'ClassDeclaration' &&
      (node as ClassDeclaration).id?.name === 'DOMSelector',
  )
  if (!adapterNode) {
    throw new Error('Missing DOMSelector class')
  }
  const adapterRows = adapterNode.body.body
    .filter(
      (node): node is MethodDefinition => node.type === 'MethodDefinition',
    )
    .map(node => {
      if (node.key.type !== 'Identifier') {
        throw new Error('Unsupported adapter member')
      }
      const name = node.key.name
      return {
        name,
        text: row(
          name,
          signature(name, node.value, adapterSource),
          adapterDescriptions[name],
          'src/dom-selector.mts',
          node.loc.start.line,
        ),
      }
    })
    .toSorted((a, b) => a.name.localeCompare(b.name, 'en'))
    .map(item => item.text)
  const options = object('Config').map(prop => {
    const name = prop.key.name
    if (!optionDescriptions[name]) {
      throw new Error(`Add an API description for ${name}`)
    }
    return `| \`${name}\` | \`${source.slice(prop.value.start, prop.value.end)}\` | ${optionDescriptions[name]} |`
  })
  const traversalSource = stripTypeScriptTypes(traversal)
  const traversalNodes = [
    ...walk(parse(traversalSource, { ecmaVersion: 'latest', locations: true })),
  ]
  const traversalDescriptions: Record<string, string> = {
    down: 'Finds a matching descendant or indexed element. The starting element can match.',
    next: 'Finds a following sibling by selector or index.',
    previous: 'Finds a preceding sibling by selector or index.',
    up: 'Finds an ancestor by selector or index.',
  }
  const traversalRows = traversalNodes
    .filter(
      (node): node is AssignmentExpression =>
        node.type === 'AssignmentExpression',
    )
    .filter(
      node =>
        node.left.type === 'MemberExpression' &&
        node.left.object.type === 'Identifier' &&
        node.left.object.name === 'D',
    )
    .map(node => {
      if (
        node.left.type !== 'MemberExpression' ||
        node.left.property.type !== 'Identifier' ||
        node.right.type !== 'Identifier'
      ) {
        throw new Error('Unsupported traversal member')
      }
      const name = node.left.property.name
      const binding = node.right.name
      const value = traversalNodes.find(
        (item): item is FunctionDeclaration =>
          item.type === 'FunctionDeclaration' &&
          (item as FunctionDeclaration).id.name === binding,
      )
      return {
        name,
        text: row(
          name,
          signature(name, value, traversalSource),
          traversalDescriptions[name],
          'src/modules/nwsapi-traversal.mts',
          node.loc.start.line,
        ),
      }
    })
    .toSorted((a, b) => a.name.localeCompare(b.name, 'en'))
    .map(item => item.text)
  return [
    '# API',
    '',
    '> Generated by `pnpm run gen:api`. Do not edit this file by hand.',
    '',
    'Use `NW.Dom` in a browser or the engine returned by the Node.js factory.',
    'The tables list every exported engine member, configuration option, and adapter method. Links point to the source.',
    '',
    '## Engine methods',
    '',
    'Query contexts default to the factory document when omitted. `closest()`, `first()`, `match()`, and `select()` accept a callback for matching elements.',
    '',
    '| Method | Result |',
    '| --- | --- |',
    ...methods,
    '',
    '<details>',
    '<summary>Configuration</summary>',
    '',
    '### Configuration',
    '',
    'Use `configure({ option: value })` to change options, `configure()` to read them, or `configure("OPTION")` to read one flag.',
    '',
    '| Option | Default | Effect |',
    '| --- | --- | --- |',
    ...options,
    '',
    '<blockquote>',
    '<p><img src="../assets/repo/important.svg" width="16" height="16" alt=""> <strong>Important</strong></p>',
    '<p>Set <code>LEGACY</code> before the first query when the environment needs compatibility fallbacks.</p>',
    '</blockquote>',
    '',
    '</details>',
    '',
    '<details>',
    '<summary>Compiler data and caches</summary>',
    '',
    '### Compiler data and caches',
    '',
    'These exports support extensions and debugging. Prefer query methods and `configure()` for normal use. Register only trusted extension code.',
    '',
    '| Member | Purpose |',
    '| --- | --- |',
    ...fields,
    '',
    '</details>',
    '',
    '<details>',
    '<summary>jsdom adapter</summary>',
    '',
    '### jsdom adapter',
    '',
    'Access the adapter as `require("nwsapi").DOMSelector` or `require("nwsapi/src/dom-selector.js")`.',
    'jsdom calls these methods through the package override. Query options can set `noexcept: true` to suppress selector errors.',
    '',
    '| Method | Result |',
    '| --- | --- |',
    ...adapterRows,
    '',
    '</details>',
    '',
    '<details>',
    '<summary>Optional browser extensions</summary>',
    '',
    '### Optional browser extensions',
    '',
    'Load `src/modules/nwsapi-traversal.js` after the core to add these methods to `NW.Dom`.',
    '',
    '| Method | Result |',
    '| --- | --- |',
    ...traversalRows,
    '',
    'The [jQuery selector extension](../src/modules/nwsapi-jquery.mts) registers extra selector patterns. It does not add query methods.',
    '',
    '</details>',
    '',
  ].join('\n')
}

export function writeApiMarkdown(
  content: string,
  file = API_DOC_PATH,
  check = false,
) {
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== content) {
      throw new Error('API documentation is stale. Run pnpm run gen:api.')
    }
  } else {
    writeFileSync(file, content)
  }
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.some(arg => arg !== '--check')) {
    throw new Error('Usage: pnpm run gen:api [--check]')
  }
  writeApiMarkdown(
    renderApiMarkdown(
      readFileSync(ENGINE_SOURCE_PATH, 'utf8'),
      readFileSync(ADAPTER_SOURCE_PATH, 'utf8'),
    ),
    API_DOC_PATH,
    args.includes('--check'),
  )
}
