import { Marked } from 'marked'
import {
  hasReviewedSummary,
  hasReviewedTitle,
  interactiveGuidePath,
  loadDocument,
} from './documents.mts'
import type { DocumentMetadata, DocumentRelation } from './documents.mts'

const markdown = new Marked({ gfm: true })
const guideLoaders = import.meta.glob<string>('../pytorch-has-routing.html', {
  query: '?raw',
  import: 'default',
})
const loadGuideSource = Object.values(guideLoaders)[0]

export type Section = {
  id: string
  title: string
  text: string
}

export type IndexedDocument = {
  path: string
  title: string
  summary: string
  category: string
  type: string
  status?: string
  date?: string
  related?: DocumentRelation[]
  sections: Section[]
  body: string
}

export type SearchResult = {
  document: IndexedDocument
  rank: number
  section?: Section
  excerpt?: string
}

function slugHeadings(headings: HTMLElement[]) {
  const used = new Map<string, number>()
  return headings.map(heading => {
    const base =
      (heading.textContent ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'section'
    const occurrenceIndex = used.get(base) ?? 0
    used.set(base, occurrenceIndex + 1)
    return {
      heading,
      id: occurrenceIndex ? `${base}-${occurrenceIndex}` : base,
    }
  })
}

function getContentHtml(path: string, source: string) {
  if (path.endsWith('.html')) {
    const report = new DOMParser().parseFromString(source, 'text/html')
    return report.querySelector('main')?.innerHTML ?? ''
  }
  return markdown.parse(source, { async: false }) as string
}

function getHeadingSelector(path: string) {
  if (path === interactiveGuidePath || !path.endsWith('.html')) {
    return 'h2, h3'
  }
  return 'h2'
}

function mapHeadingIds(headings: HTMLElement[], interactiveGuide: boolean) {
  if (interactiveGuide) {
    return new Map(headings.map(heading => [heading, heading.id]))
  }
  return new Map(slugHeadings(headings).map(({ heading, id }) => [heading, id]))
}

function appendSectionText(current: Section, source: string | null) {
  const text = source?.replace(/\s+/g, ' ').trim() ?? ''
  if (text) {
    current.text += `${current.text ? ' ' : ''}${text}`
  }
}

function collectSections(
  parsed: Document,
  headingSelector: string,
  headingIds: Map<HTMLElement, string>,
) {
  const sections: Section[] = []
  let current: Section = { id: '', title: '', text: '' }
  const walker = parsed.createTreeWalker(
    parsed.body,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  )
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node instanceof HTMLElement && node.matches(headingSelector)) {
      if (current.title || current.text) {
        sections.push(current)
      }
      current = {
        id: headingIds.get(node) ?? '',
        title: node.textContent?.trim() ?? '',
        text: '',
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      appendSectionText(current, node.textContent)
    }
  }
  if (current.title || current.text) {
    sections.push(current)
  }
  return sections
}

function getSummary(parsed: Document, heading: Element | null) {
  const followingParagraph = heading?.nextElementSibling?.matches('p')
    ? heading.nextElementSibling.textContent
    : undefined
  const firstParagraph = Array.from(parsed.querySelectorAll('p')).find(
    paragraph => !paragraph.closest('blockquote'),
  )?.textContent
  return (
    (followingParagraph ?? firstParagraph)?.replace(/\s+/g, ' ').trim() ?? ''
  )
}

function parseContent(path: string, source: string) {
  const parsed = new DOMParser().parseFromString(
    getContentHtml(path, source),
    'text/html',
  )
  const interactiveGuide = path === interactiveGuidePath
  const headingSelector = getHeadingSelector(path)
  const headings = Array.from(
    parsed.querySelectorAll<HTMLElement>(headingSelector),
  )
  const headingIds = mapHeadingIds(headings, interactiveGuide)
  const sections = collectSections(parsed, headingSelector, headingIds)
  const heading = parsed.querySelector('h1')
  return {
    title: heading?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    summary: getSummary(parsed, heading),
    sections,
    body: parsed.body.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  }
}

export async function indexDocument(
  metadata: DocumentMetadata,
  retry = false,
): Promise<IndexedDocument> {
  const source =
    metadata.path === interactiveGuidePath && !retry
      ? await loadGuideSource?.()
      : await loadDocument(metadata.path, { retry })
  if (source === undefined) {
    throw new Error(`No source was returned for ${metadata.path}`)
  }
  const parsed = parseContent(metadata.path, source)
  return {
    ...metadata,
    title: hasReviewedTitle(metadata.path)
      ? metadata.title
      : parsed.title || metadata.title,
    summary: hasReviewedSummary(metadata.path)
      ? metadata.summary
      : parsed.summary || metadata.summary,
    sections: parsed.sections,
    body: parsed.body,
  }
}
