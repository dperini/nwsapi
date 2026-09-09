import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'
import {
  renderApiMarkdown,
  writeApiMarkdown,
} from '../../../scripts/repo/gen/api-md.mts'
import {
  ADAPTER_SOURCE_PATH,
  API_DOC_PATH,
  ENGINE_SOURCE_PATH,
} from '../../../scripts/repo/lib/paths.mts'

const engine = readFileSync(ENGINE_SOURCE_PATH, 'utf8')
const adapter = readFileSync(ADAPTER_SOURCE_PATH, 'utf8')

test('API nests a readable callout inside its collapsed section', t => {
  const markdown = renderApiMarkdown(engine, adapter)
  const dom = new JSDOM(markdown)
  t.onTestFinished(() => dom.window.close())
  const notes = dom.window.document.querySelectorAll('details blockquote')
  expect(notes).toHaveLength(1)
  const note = notes[0]
  expect(note!.querySelector('strong')?.textContent).toBe('Important')
  expect(note!.querySelector('code')?.textContent).toBe(
    'src/modules/nwsapi-legacy.js',
  )
  expect(note!.querySelectorAll('p')[1]?.textContent).toBe(
    'Load src/modules/nwsapi-legacy.js after the core and before the first query when the environment needs compatibility fallbacks.',
  )
  const icon = note!.querySelector('img')
  expect(icon?.getAttribute('src')).toBe('../../../assets/repo/important.svg')
  expect(icon?.getAttribute('alt')).toBe('')
  expect(icon?.getAttribute('width')).toBe('16')
  expect(icon?.getAttribute('height')).toBe('16')
  expect(note!.querySelector('[style], [class], svg, script')).toBeNull()
  expect(markdown).not.toContain('[!IMPORTANT]')
})

test('README links to the API without repeating its reference tables', () => {
  const markdown = readFileSync(
    new URL('../../../README.md', import.meta.url),
    'utf8',
  )
  const section = markdown.split('## API\n')[1]!.split('\n## ')[0]!.trim()
  expect(section).toBe(
    'See the [full API reference](docs/repo/selector/api.md) for all methods, options, and adapter APIs.',
  )
})

test('the API reference matches the source exports without running the factory', () => {
  const output = renderApiMarkdown(engine, adapter)
  expect(output).toBe(readFileSync(API_DOC_PATH, 'utf8'))
  expect(output).toContain('`closest(selectors, element, callback)`')
  expect(output).toContain('`match(selectors, element, callback)`')
  expect(output).toContain('`select(selectors, context, callback)`')
  expect(output).toContain('`up(element, expr)`')
  expect(output).not.toContain('`ancestor(')
  expect(output).toContain('`USR_EVENT` | `true`')
  expect(output).toContain('require("nwsapi").DOMSelector')
  expect(output).toContain('`DOMSelector.configure(window, options)`')
  expect(output).toContain('`DOMSelector.use(window, engine)`')
  expect(output.indexOf('`byClass(')).toBeLessThan(output.indexOf('`byId('))
  expect(
    renderApiMarkdown('throw new Error("do not execute");\n' + engine, adapter),
  ).toContain('# API')
})

test('new exports need a description instead of silently disappearing', () => {
  expect(() =>
    renderApiMarkdown(
      engine.replace('Dom = {', 'Dom = { undocumented: select,'),
      adapter,
    ),
  ).toThrow('undocumented')
  expect(() =>
    renderApiMarkdown(
      engine,
      adapter.replace(
        'class DOMSelector {',
        'class DOMSelector { undocumented() {}',
      ),
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
