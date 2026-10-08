import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  globSync,
  statSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { parseSync } from '@swc/core'
import { JSDOM } from 'jsdom'
import { markdownRecipe, requests } from './markdown.mts'
import { REPO_ROOT } from '../lib/paths.mts'

const directory = path.join(REPO_ROOT, '.cache/docs-localization')
mkdirSync(directory, { recursive: true })
const paths = ['README.md', ...globSync('docs/**/*.md', { cwd: REPO_ROOT })]
  .filter(file => !file.endsWith('.it.md') && !file.includes('/translations/'))
  .filter(file => statSync(path.join(REPO_ROOT, file)).isFile())
  .toSorted()
const documents = paths.map(file => {
  const source = readFileSync(path.join(REPO_ROOT, file), 'utf8')
  return {
    source: file,
    sha256: createHash('sha256').update(source).digest('hex'),
    title: source.match(/^#\s+(.+)$/m)?.[1] ?? file,
    recipe: markdownRecipe(source),
  }
})

const ui = new Set<string>()
const window = new JSDOM('').window
function addText(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (
    /\b[a-zA-Z]{2,}\b/.test(normalized.replace(/ZXQ\d+QXZ/g, '')) &&
    normalized.length < 2000
  ) {
    ui.add(normalized)
    requests.add(normalized)
  }
}
function html(source: string) {
  const fragment = window.document.createElement('div')
  fragment.innerHTML = source
  const walker = window.document.createTreeWalker(
    fragment,
    window.NodeFilter.SHOW_TEXT,
  )
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (!node.parentElement?.closest('code, pre, script, style, svg')) {
      addText(node.textContent ?? '')
    }
  }
  for (const element of fragment.querySelectorAll('*')) {
    for (const name of [
      'aria-label',
      'aria-valuetext',
      'title',
      'alt',
      'placeholder',
    ]) {
      const value = element.getAttribute(name)
      if (value) {
        addText(value)
      }
    }
  }
}
function visit(value: unknown) {
  if (!value || typeof value !== 'object') {
    return
  }
  const node = value as Record<string, unknown>
  if (node['type'] === 'StringLiteral' && typeof node['value'] === 'string') {
    html(node['value'])
  }
  if (node['type'] === 'TemplateLiteral') {
    const quasis = node['quasis'] as Array<{ cooked: string; raw: string }>
    html(
      quasis
        .map(
          (part, index) =>
            (index ? `ZXQ${index - 1}QXZ` : '') + (part.cooked ?? part.raw),
        )
        .join(''),
    )
  }
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      child.forEach(visit)
    } else if (child && typeof child === 'object') {
      visit(child)
    }
  }
}
for (const file of globSync('docs/repo/perf/**/*.html', { cwd: REPO_ROOT })) {
  html(readFileSync(path.join(REPO_ROOT, file), 'utf8'))
}
for (const file of globSync('docs/repo/perf/**/*.mts', { cwd: REPO_ROOT })) {
  visit(
    parseSync(readFileSync(path.join(REPO_ROOT, file), 'utf8'), {
      syntax: 'typescript',
    }),
  )
}
const transcript = JSON.parse(
  readFileSync(
    path.join(REPO_ROOT, 'assets/repo/model-guide/narration/transcript.json'),
    'utf8',
  ),
) as { sections: Array<{ text: string }> }
for (const section of transcript.sections) {
  addText(section.text)
}
window.close()
writeFileSync(path.join(directory, 'documents.json'), JSON.stringify(documents))
writeFileSync(path.join(directory, 'ui.json'), JSON.stringify([...ui]))
writeFileSync(
  path.join(directory, 'requests.json'),
  JSON.stringify([...requests]),
)
console.log(
  `${documents.length} documents, ${ui.size} interface strings, ${requests.size} translation requests`,
)
