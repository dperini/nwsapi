import { JSDOM } from 'jsdom'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  engineDefinitions,
  engineSignature,
  readEngineSources,
} from '../../../../../scripts/repo/gen/api/engine.mts'
import {
  renderApiMarkdown,
  writeApiMarkdown,
} from '../../../../../scripts/repo/gen/api/markdown.mts'
import {
  ADAPTER_SOURCE_PATH,
  ENGINE_SOURCE_PATH,
  TRAVERSAL_SOURCE_PATH,
} from '../../../../../scripts/repo/lib/paths.mts'

const engine = readFileSync(ENGINE_SOURCE_PATH, 'utf8')
const adapter = readFileSync(ADAPTER_SOURCE_PATH, 'utf8')
const traversal = readFileSync(TRAVERSAL_SOURCE_PATH, 'utf8')
const apiMarkdown = renderApiMarkdown(engine, adapter, traversal)

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
  expect(() =>
    renderApiMarkdown(engine, adapter, traversal, [
      ...readEngineSources(),
      {
        file: 'src/core/initialize/fixture.mts',
        text: 'engine.Dom = { undocumented: function () {} }',
      },
    ]),
  ).toThrow('undocumented')
  expect(() =>
    renderApiMarkdown(
      engine,
      'class DOMSelector { undocumented() {} }',
      traversal,
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
