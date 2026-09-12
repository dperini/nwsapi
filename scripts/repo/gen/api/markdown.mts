import type {
  AssignmentExpression,
  ClassDeclaration,
  FunctionDeclaration,
  FunctionExpression,
  MethodDefinition,
  Node,
} from 'acorn'
import { parse } from 'acorn'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import {
  ADAPTER_SOURCE_PATH,
  API_DOC_PATH,
  ENGINE_SOURCE_PATH,
  TRAVERSAL_SOURCE_PATH,
} from '../../lib/paths.mts'
import { isMainModule } from '../../lib/run-node.mts'
import {
  adapterDescriptions,
  descriptions,
  optionDescriptions,
  walk,
} from './descriptions.mts'
import {
  engineDefinitions,
  engineSignature,
  readEngineSources,
  type ApiSource,
} from './engine.mts'

export function findNode<T extends Node>(
  root: Node,
  matches: (node: Node) => node is T,
): T | undefined {
  for (const node of walk(root)) {
    if (matches(node)) {
      return node
    }
  }
  return undefined
}

export function renderApiMarkdown(
  engine: string,
  adapter: string,
  traversal = readFileSync(TRAVERSAL_SOURCE_PATH, 'utf8'),
  sources: ApiSource[] = readEngineSources(),
): string {
  const source = stripTypeScriptTypes(engine)
  // Stop at the factory instead of materializing its entire implementation.
  const factory = findNode(
    parse(source, { ecmaVersion: 'latest', locations: true }),
    (node): node is FunctionExpression =>
      node.type === 'FunctionExpression' &&
      (node as FunctionExpression).id?.name === 'Factory',
  )
  if (!factory) {
    throw new Error('Missing Factory function')
  }
  const { object, resolve } = engineDefinitions(sources)
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
    return `| [\`${signature}\`](../../../${file}#L${line}) | ${summary} |`
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
  const methods = new Map<string, string>()
  const fields: string[] = []
  for (const definition of object('Dom')) {
    const prop = definition.node
    const name = prop.key.name
    const value = resolve({ ...definition, node: prop.value })
    const text = row(
      name,
      engineSignature(name, value),
      descriptions[name],
      value.file,
      value.node.loc!.start.line,
    )
    if (
      value.node.type === 'FunctionExpression' ||
      value.node.type === 'FunctionDeclaration'
    ) {
      methods.set(name, text)
    } else {
      fields.push(text)
    }
  }
  const methodGroups = [
    [
      'Query elements',
      ['closest', 'first', 'match', 'select'],
      'Select descendants, test a match, or find the nearest matching ancestor.',
    ],
    [
      'Look up elements',
      ['byClass', 'byId', 'byTag'],
      'Find elements directly by class, ID, or tag name.',
    ],
    [
      'Configure the engine',
      ['configure', 'emit', 'registerLegacyHooks'],
      'Change engine options and error handling.',
    ],
    [
      'Compile and extend selectors',
      ['compile', 'registerCombinator', 'registerOperator', 'registerSelector'],
      'Advanced APIs for compiled resolvers and trusted selector extensions.',
    ],
    [
      'Override browser DOM methods',
      ['install', 'uninstall'],
      'Calling `NW.Dom.install()` redirects native `querySelector()`, `querySelectorAll()`, `matches()`, and `closest()` calls to NWSAPI. `uninstall()` restores them. Direct engine calls work without installation.',
    ],
  ] as const
  const groupedMethods = methodGroups.flatMap(([title, names, description]) => [
    `### ${title}`,
    '',
    description,
    '',
    '| Method | Result |',
    '| --- | --- |',
    ...names.map(name => {
      const text = methods.get(name)
      if (!text) {
        throw new Error(`Missing API method ${name}`)
      }
      methods.delete(name)
      return text
    }),
    '',
  ])
  if (methods.size) {
    throw new Error(
      `Assign API methods to a category: ${[...methods.keys()].join(', ')}`,
    )
  }
  const adapterSource = stripTypeScriptTypes(adapter)
  const adapterNode = findNode(
    parse(adapterSource, {
      ecmaVersion: 'latest',
      locations: true,
      sourceType: 'module',
    }),
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
          node.kind === 'get'
            ? name
            : signature(
                node.static ? `DOMSelector.${name}` : name,
                node.value,
                adapterSource,
              ),
          adapterDescriptions[name],
          'src/adapter/dom-selector.mts',
          node.loc!.start.line,
        ),
      }
    })
    .toSorted((a, b) => a.name.localeCompare(b.name, 'en'))
    .map(item => item.text)
  const options = object('Config').map(definition => {
    const prop = definition.node
    const name = prop.key.name
    if (!optionDescriptions[name]) {
      throw new Error(`Add an API description for ${name}`)
    }
    return `| \`${name}\` | \`${definition.text.slice(prop.value.start, prop.value.end)}\` | ${optionDescriptions[name]} |`
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
          'src/extension/traversal/register.mts',
          node.loc!.start.line,
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
    '| API | Purpose |',
    '| --- | --- |',
    '| [Core engine](#engine-methods) | Query an existing DOM with `select()`, `first()`, `match()`, and `closest()`. |',
    '| [Browser DOM overrides](#override-browser-dom-methods) | Route native selector methods through NWSAPI with `install()`. |',
    '| [jsdom adapter](#jsdom-adapter) | Integrate the engine with jsdom queries and stylesheet matching. |',
    '| [jQuery selector extension](#jquery-selector-extension) | Add optional jQuery-style selector syntax. jQuery itself is not required. |',
    '| [DOM traversal extension](#dom-traversal-extension) | Navigate parents, children, and siblings with `up()`, `down()`, `next()`, and `previous()`. |',
    '',
    '## Engine methods',
    '',
    '`first()` and `select()` use the factory document when the context is omitted. `byClass()`, `byId()`, and `byTag()` require a context. `closest()`, `first()`, `match()`, and `select()` accept a callback for matching elements.',
    '',
    ...groupedMethods,
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
    '<p><img src="../../../assets/repo/important.svg" width="16" height="16" alt=""> <strong>Important</strong></p>',
    '<p>Load <code>src/modules/nwsapi-legacy.js</code> after the core and before the first query when the environment needs compatibility fallbacks.</p>',
    '</blockquote>',
    '',
    '</details>',
    '',
    '### Legacy hooks',
    '',
    'The optional `src/modules/nwsapi-legacy.js` module calls `registerLegacyHooks()` on the existing engine. It supplies attribute readers, tree traversal, candidate lookup, cache allocators, native matcher aliases, resolver rewriting, and iframe setup. It reuses the core parser and selector logic.',
    '',
    'In a browser, load the module after `src/nwsapi.js` and before the jQuery or traversal modules. With CommonJS, call `require("nwsapi/src/modules/nwsapi-legacy.js")(engine)`. Registration detects older DOM hosts. Use `engine.configure({ LEGACY: true })` to force that behavior on a modern host.',
    '',
    'Each engine owns its hook state. Repeated registration keeps the first set of hooks. The core contains the registration points, and the optional module contains the compatibility implementations. The jsdom adapter loads this module when its setup options enable `LEGACY`.',
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
    'Configure before parsing, because styles and scripts can use selectors during document creation:',
    '',
    '```js',
    'const { DOMSelector } = require("nwsapi")',
    'const { JSDOM } = require("jsdom")',
    'const dom = new JSDOM(html, {',
    '  beforeParse(window) {',
    '    DOMSelector.configure(window, { LEGACY: true })',
    '  }',
    '})',
    '```',
    '',
    'To reuse an engine, create a document without styles, then call `DOMSelector.use(window, engine)` before adding styles or running queries. The engine must belong to that document and have `VERBOSITY: true`. DOM queries throw for invalid selectors; stylesheet checks return no match.',
    '',
    'Setup locks on the first query, selector support check, or stylesheet match. Do not change the shared engine configuration directly after setup: jsdom can cache computed styles. Separate factory calls remain independent. Compatible adapter copies share setup even when the package override loads a second copy.',
    '',
    '| Method | Result |',
    '| --- | --- |',
    ...adapterRows,
    '',
    '</details>',
    '',
    '<details>',
    '<summary>DOM traversal extension</summary>',
    '',
    '### DOM traversal extension',
    '',
    'Load `src/modules/nwsapi-traversal.js` after the core to add these methods to `NW.Dom`.',
    'These helpers navigate an existing DOM; they do not create a DOM or replace native methods. For example, `NW.Dom.up(element, "article")` finds the nearest matching ancestor.',
    '',
    '| Method | Result |',
    '| --- | --- |',
    ...traversalRows,
    '',
    'Traversal sibling and ancestor indexes are zero-based: omitted or `0` returns the nearest element. `down()` without an argument (or with `null`) returns the first element child; `down(element, 0)` returns the starting element and positive indexes walk descendants in document order, starting at `1`. Selector arguments may match the starting element for `down()`. Missing matches return `null`.',
    '',
    '</details>',
    '',
    '<details>',
    '<summary>jQuery selector extension</summary>',
    '',
    '### jQuery selector extension',
    '',
    'Load `src/modules/nwsapi-jquery.js` after the core to add selectors such as `:eq(1)`, `:even`, `:input`, and `:visible`. Use them through the existing engine methods, for example `NW.Dom.select("p:even", document)`. The extension does not load or require jQuery.',
    '',
    'This is an extension example, not full jQuery compatibility. `:even`, `:odd`, `:eq(n)`, `:lt(n)`, and `:gt(n)` filter the matched candidates within each compiled selector branch; `match()` treats its element as a singleton set. The original `:first`, `:last`, and `:nth(n)` extensions use document-wide indexes among elements of the same tag, excluding the document root. Integer arguments are validated; negative indexes are not translated from the end. `:visible` and `:hidden` use offset dimensions. Core Selectors Level 4 semantics handle `:has()`. These extensions do not emulate jQuery set operations across selector lists or complex positional chains.',
    '',
    'See the [jQuery comparison tests and known differences](../testing/jquery.md) for runnable examples.',
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
