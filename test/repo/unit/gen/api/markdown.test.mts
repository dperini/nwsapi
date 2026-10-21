import { JSDOM } from 'jsdom'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test, vi } from 'vitest'
import type * as Paths from '../../../../../scripts/repo/lib/paths.mts'
import {
  engineDefinitions,
  engineSignature,
} from '../../../../../scripts/repo/gen/api/engine.mts'
import {
  renderApiMarkdown,
  writeApiMarkdown,
} from '../../../../../scripts/repo/gen/api/markdown.mts'
import {
  adapterDescriptions,
  descriptions,
  optionDescriptions,
} from '../../../../../scripts/repo/gen/api/descriptions.mts'

const methodNames = [
  'byClass',
  'byId',
  'byTag',
  'closest',
  'first',
  'match',
  'select',
  'configure',
  'emit',
  'registerLegacyHooks',
  'useRoutePlanner',
  'registerBulkHasPlanner',
  'compile',
  'registerCombinator',
  'registerOperator',
  'registerSelector',
  'install',
  'uninstall',
]
const fieldNames = Object.keys(descriptions).filter(
  name => !methodNames.includes(name),
)
const engine = 'var Factory = function Factory() {}'
const adapter = `class DOMSelector { ${Object.keys(adapterDescriptions)
  .map(name => `${name}() {}`)
  .join('\n')} }`
const traversal = `function down(node) {}\nfunction next(node) {}\nfunction previous(node) {}\nfunction up(node) {}\nvar D = {}; D.down = down; D.next = next; D.previous = previous; D.up = up;`
const apiSources = [
  {
    file: 'src/core/initialize/api.mts',
    text: `engine.Dom = { ${[
      ...methodNames.map(name => `${name}: function () {}`),
      ...fieldNames.map(name => `${name}: {}`),
    ].join(', ')} }; engine.Config = { ${Object.keys(optionDescriptions)
      .map(name => `${name}: false`)
      .join(', ')} };`,
  },
]
const apiMarkdown = renderApiMarkdown(engine, adapter, traversal, apiSources)

test('API nests a readable callout inside its collapsed section', t => {
  const dom = new JSDOM(apiMarkdown)
  t.onTestFinished(() => dom.window.close())
  const notes = dom.window.document.querySelectorAll('details blockquote')
  expect(notes).toHaveLength(1)
  const note = notes[0]
  expect(note!.querySelector('strong')).not.toBeNull()
  expect(note!.querySelector('code')).not.toBeNull()
  const icon = note!.querySelector('img')
  expect(icon?.getAttribute('src')).toBe('../../../assets/repo/important.svg')
  expect(icon?.getAttribute('alt')).toBe('')
  expect(icon?.getAttribute('width')).toBe('16')
  expect(icon?.getAttribute('height')).toBe('16')
  expect(note!.querySelector('[style], [class], svg, script')).toBeNull()
})

test('API discovery reads declarations without executing engine code', () => {
  const definitions = engineDefinitions([
    {
      file: 'fixture.mts',
      text: `throw new Error('do not execute')
      export function select(engine: unknown, selectors: string) { return [] }
      engine.select = select.bind(null, engine)
      engine.Dom = { select: engine.select }
      engine.Config = { IDS_DUPES: true }`,
    },
  ])
  const method = definitions.object('Dom')[0]!
  const value = definitions.resolve({ ...method, node: method.node.value })
  expect(value.node.type).toBe('FunctionDeclaration')
  expect(engineSignature('select', value)).toBe('select(selectors)')
  expect(definitions.object('Config')[0]!.node.value).toMatchObject({
    type: 'Literal',
    value: true,
  })
})

test('API discovery rejects unsupported export declarations', () => {
  const definitions = engineDefinitions([
    { file: 'fixture.mts', text: 'engine.Dom = { ...other }' },
  ])
  expect(() => definitions.object('Dom')).toThrow('Unsupported Dom member')
  expect(() => definitions.object('Config')).toThrow(
    'Missing Config export object',
  )
})

test('API discovery retains initializer definitions over runtime assignments', () => {
  const definitions = engineDefinitions([
    { file: 'src/core/dom/earlier.mts', text: 'engine.Dom = { incorrect: 0 }' },
    {
      file: 'src/core/initialize/api.mts',
      text: 'engine.Dom = { selected: 1 }',
    },
    { file: 'src/core/dom/later.mts', text: 'engine.Dom = { incorrect: 2 }' },
  ])
  expect(definitions.object('Dom').map(member => member.node.key.name)).toEqual(
    ['selected'],
  )
})

test('new exports need a description instead of silently disappearing', () => {
  const undocumentedSources = apiSources.map(source => ({
    ...source,
    text: source.text.replace(
      'uninstall: function () {}',
      'uninstall: function () {}, undocumented: function () {}',
    ),
  }))
  expect(() =>
    renderApiMarkdown(engine, adapter, traversal, undocumentedSources),
  ).toThrow('undocumented')
  expect(() =>
    renderApiMarkdown(
      engine,
      'class DOMSelector { undocumented() {} }',
      traversal,
      apiSources,
    ),
  ).toThrow('undocumented')
})

test('check mode detects missing or stale docs without writing', t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-api-'))
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'api.md')
  expect(() => writeApiMarkdown('new', file, true)).toThrow('stale')
  writeFileSync(file, 'old')
  expect(() => writeApiMarkdown('new', file, true)).toThrow('stale')
  expect(readFileSync(file, 'utf8')).toBe('old')
  writeApiMarkdown('new', file)
  expect(() => writeApiMarkdown('new', file, true)).not.toThrow()
})

test('requires expected AST structures for engine, adapter and traversal', () => {
  expect(() => renderApiMarkdown('', adapter, traversal, apiSources)).toThrow()
  expect(() => renderApiMarkdown(engine, '', traversal, apiSources)).toThrow()
  expect(() =>
    renderApiMarkdown(
      engine,
      "class DOMSelector { ['querySelector']() {} }",
      traversal,
      apiSources,
    ),
  ).toThrow()
  expect(() =>
    renderApiMarkdown(engine, adapter, 'D.down = function() {}', apiSources),
  ).toThrow()
  expect(() =>
    renderApiMarkdown(engine, adapter, traversal, [
      { file: 'fixture.mts', text: 'engine.Dom={select:function(){}}' },
    ]),
  ).toThrow()
  expect(() =>
    renderApiMarkdown(engine, adapter, traversal, [
      ...apiSources,
      {
        file: 'src/core/initialize/fixture.mts',
        text: 'engine.Config={UNKNOWN:true}',
      },
    ]),
  ).toThrow()
  const methods = engineDefinitions(apiSources)
    .object('Dom')
    .map(member => member.node.key.name)
  const text = `engine.Dom={${methods.map(name => `${name}:function(){}`).join(',')}}`
  expect(() =>
    renderApiMarkdown(engine, adapter, traversal, [
      { file: 'fixture.mts', text },
    ]),
  ).toThrow()
})

test('CLI rejects unsupported arguments', async () => {
  vi.resetModules()
  vi.doMock('../../../../../scripts/repo/lib/run-node.mts', () => ({
    isMainModule: () => true,
  }))
  const directory = mkdtempSync(path.join(os.tmpdir(), 'nwsapi-api-cli-'))
  const actual = await vi.importActual<typeof Paths>(
    '../../../../../scripts/repo/lib/paths.mts',
  )
  vi.doMock('../../../../../scripts/repo/lib/paths.mts', () => ({
    ...actual,
    API_DOC_PATH: path.join(directory, 'api.md'),
  }))
  const argv = process.argv
  process.argv = ['node', 'markdown.mts', '--invalid']
  try {
    await expect(
      import('../../../../../scripts/repo/gen/api/markdown.mts'),
    ).rejects.toThrow()
  } finally {
    process.argv = argv
    rmSync(directory, { recursive: true, force: true })
    vi.doUnmock('../../../../../scripts/repo/lib/run-node.mts')
    vi.doUnmock('../../../../../scripts/repo/lib/paths.mts')
  }
})

test('resolving external or unbound members preserves their parsed definitions', () => {
  const definitions = engineDefinitions([
    {
      file: 'fixture.mts',
      text: 'engine.Dom={external:other.method,missing:engine.missing,bound:unknown.bind(null)}',
    },
  ])
  const entries = definitions.object('Dom')
  for (let i = 0, length = entries.length; i < length; i += 1) {
    const entry = entries[i]!
    const value = { ...entry, node: entry.node.value }
    expect(definitions.resolve(value)).toBe(value)
  }
  expect(() =>
    renderApiMarkdown(engine, adapter, 'D.down=missing', apiSources),
  ).not.toThrow()
})
