import { initializeLocale, translate } from './locale.mts'
import { mountCatalogControls } from './catalog-controls.mts'
import { connectSearchInput, settledAnnouncement } from './catalog-input.mts'
import { initializeGuideControls } from './select.mts'
import { indexDocument } from './catalog-index.mts'
import { getHighlightRanges, searchDocument } from './catalog-search.mts'
import type { IndexedDocument, SearchResult } from './catalog-index.mts'
import {
  documentHref,
  documentCategoryKey,
  documentTypeLabel,
  documents,
  getDocument,
} from './documents.mts'
import type { DocumentMetadata } from './documents.mts'

let searchInput: HTMLInputElement
let categoryFilter: HTMLSelectElement
let typeFilter: HTMLSelectElement
let clearButton: HTMLButtonElement
let undoButton: HTMLButtonElement
let searchControls: ReturnType<typeof connectSearchInput>
let setClearDisabled: (disabled: boolean) => void
let retryButton: HTMLButtonElement
let loadStatus: HTMLParagraphElement
const results = document.querySelector<HTMLDivElement>('#document-results')!
const count = document.querySelector<HTMLParagraphElement>('#document-count')!
const empty = document.querySelector<HTMLParagraphElement>('#document-empty')!
const announcement = settledAnnouncement(count)
const indexed = new Map<string, IndexedDocument>()
const failedDocuments = new Map<string, Error>()
let indexReady = false
let loadInProgress = false

function addOptions(
  select: HTMLSelectElement,
  values: string[],
  label = (value: string) => value,
) {
  for (const value of values) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label(value)
    select.append(option)
  }
}

function appendTextResult(container: HTMLElement, text: string) {
  const paragraph = document.createElement('p')
  paragraph.className = 'document-match'
  paragraph.append(document.createTextNode(`${translate('matchingText')} `))
  appendHighlightedText(paragraph, text, searchInput.value.trim())
  container.append(paragraph)
}

function appendHighlightedText(
  container: HTMLElement,
  text: string,
  query: string,
) {
  const ranges = getHighlightRanges(text, query)
  let offset = 0
  for (const range of ranges) {
    if (range.start < offset) {
      continue
    }
    container.append(document.createTextNode(text.slice(offset, range.start)))
    const mark = document.createElement('mark')
    mark.textContent = text.slice(range.start, range.end)
    container.append(mark)
    offset = range.end
  }
  container.append(document.createTextNode(text.slice(offset)))
}

function renderResult(result: SearchResult, query: string) {
  const { document: item } = result
  const article = document.createElement('article')
  article.className = 'document-result'
  const category = document.createElement('span')
  category.className = 'document-category-badge'
  category.dataset['slot'] = 'badge'
  category.dataset['variant'] = 'secondary'
  category.dataset['category'] = documentCategoryKey(item.category)
  category.textContent = item.category
  article.append(category)
  const heading = document.createElement('h2')
  const link = document.createElement('a')
  link.href = documentHref(item.path)
  appendHighlightedText(link, item.title, query)
  heading.append(link)
  article.append(heading)
  const metadata = document.createElement('p')
  metadata.className = 'document-metadata'
  metadata.textContent = [
    item.type === 'Document' ? undefined : documentTypeLabel(item.type),
    item.status,
    item.date,
  ]
    .filter(Boolean)
    .join(' · ')
  if (metadata.textContent) {
    article.append(metadata)
  }
  const summary = document.createElement('p')
  summary.className = 'document-summary'
  appendHighlightedText(summary, item.summary, query)
  article.append(summary)
  if (query && result.excerpt) {
    if (result.section?.id) {
      const match = document.createElement('p')
      match.className = 'document-match'
      const sectionLink = document.createElement('a')
      sectionLink.href = `${documentHref(item.path)}#${encodeURIComponent(result.section.id)}`
      const [prefix, suffix = ''] =
        translate('matchingSection').split('{title}')
      sectionLink.append(document.createTextNode(prefix ?? ''))
      appendHighlightedText(sectionLink, result.section.title, query)
      sectionLink.append(document.createTextNode(suffix))
      match.append(sectionLink, document.createTextNode(' — '))
      appendHighlightedText(match, result.excerpt, query)
      article.append(match)
    } else {
      appendTextResult(article, result.excerpt)
    }
  }
  const relations = (item.related ?? []).flatMap(relation => {
    const target = getDocument(relation.path)
    return target ? [{ target, label: relation.label }] : []
  })
  if (relations.length) {
    const related = document.createElement('div')
    related.className = 'document-related'
    for (const relation of relations) {
      const relationLink = document.createElement('a')
      relationLink.href = documentHref(relation.target.path)
      relationLink.textContent = relation.label
      related.append(relationLink)
    }
    article.append(related)
  }
  return article
}

function saveUrlState() {
  const url = new URL(location.href)
  url.searchParams.delete('q')
  url.searchParams.delete('category')
  url.searchParams.delete('type')
  if (searchInput.value.trim()) {
    url.searchParams.set('q', searchInput.value.trim())
  }
  if (categoryFilter.value) {
    url.searchParams.set('category', categoryFilter.value)
  }
  if (typeFilter.value) {
    url.searchParams.set('type', typeFilter.value)
  }
  history.replaceState(null, '', url)
}

function syncClearButton() {
  setClearDisabled(searchInput.value.length === 0)
}

function updateResults(updateUrl = true) {
  if (searchControls?.isComposing()) {
    return
  }
  syncClearButton()
  if (!indexReady) {
    if (updateUrl) {
      saveUrlState()
    }
    return
  }
  const query = searchInput.value.trim()
  const category = categoryFilter.value
  const type = typeFilter.value
  const found: SearchResult[] = []
  for (const document of indexed.values()) {
    if (category && document.category !== category) {
      continue
    }
    if (type && document.type !== type) {
      continue
    }
    const result = searchDocument(document, query)
    if (result) {
      found.push(result)
    }
  }
  const ordered = found.toSorted(
    (left, right) =>
      left.rank - right.rank ||
      left.document.title.localeCompare(right.document.title),
  )
  results.replaceChildren(...ordered.map(result => renderResult(result, query)))
  announcement.update(
    translate(
      ordered.length === 1 ? 'documentCountOne' : 'documentCountMany',
    ).replace('{count}', String(ordered.length)),
  )
  empty.hidden = ordered.length > 0 || failedDocuments.size > 0
  results.setAttribute('aria-busy', String(loadInProgress))
  if (updateUrl) {
    saveUrlState()
  }
}

function updateLoadStatus() {
  retryButton.textContent = translate('retryFailedDocuments')
  if (loadInProgress && indexReady) {
    loadStatus.textContent = translate('retryingDocuments').replace(
      '{count}',
      String(failedDocuments.size),
    )
    loadStatus.hidden = false
    retryButton.disabled = true
    retryButton.hidden = false
    return
  }
  if (failedDocuments.size === 0) {
    loadStatus.hidden = true
    loadStatus.textContent = ''
    retryButton.hidden = true
    return
  }
  loadStatus.textContent = translate('documentsLoadFailure').replace(
    '{count}',
    String(failedDocuments.size),
  )
  loadStatus.hidden = false
  retryButton.textContent = translate('retryFailedDocuments')
  retryButton.hidden = false
  retryButton.disabled = false
}

async function loadDocuments(paths: DocumentMetadata[]) {
  if (paths.length === 0) {
    updateLoadStatus()
    return
  }
  loadInProgress = true
  results.setAttribute('aria-busy', 'true')
  if (indexReady) {
    loadStatus.textContent = translate('retryingDocuments').replace(
      '{count}',
      String(paths.length),
    )
    loadStatus.hidden = false
    retryButton.disabled = true
  }
  const outcomes = await Promise.allSettled(
    paths.map(metadata => indexDocument(metadata, indexReady)),
  )
  for (const [index, outcome] of outcomes.entries()) {
    const path = paths[index]!.path
    if (outcome.status === 'fulfilled') {
      indexed.set(path, outcome.value)
      failedDocuments.delete(path)
    } else {
      failedDocuments.set(
        path,
        outcome.reason instanceof Error
          ? outcome.reason
          : new Error(String(outcome.reason)),
      )
    }
  }
  indexReady = true
  loadInProgress = false
  updateResults(false)
  updateLoadStatus()
}

function bindCatalogEvents() {
  const form = document.querySelector<HTMLFormElement>('#document-filters')!
  form.addEventListener('submit', event => {
    event.preventDefault()
    updateResults()
  })
  searchControls = connectSearchInput({
    input: searchInput,
    clear: clearButton,
    undo: undoButton,
    setClearDisabled,
    update: () => updateResults(),
    cancelAnnouncement: () => announcement.cancel(),
  })
  categoryFilter.addEventListener('change', () => updateResults())
  typeFilter.addEventListener('change', () => updateResults())
  retryButton.addEventListener('click', () => {
    const pending = documents.filter(metadata =>
      failedDocuments.has(metadata.path),
    )
    void loadDocuments(pending)
  })
  addEventListener('popstate', () => {
    const current = new URL(location.href)
    searchInput.value = current.searchParams.get('q') ?? ''
    searchControls.reset()
    categoryFilter.value = current.searchParams.get('category') ?? ''
    typeFilter.value = current.searchParams.get('type') ?? ''
    document.dispatchEvent(new Event('guide-controls-sync'))
    updateResults(false)
  })
}

async function initialize() {
  const url = new URL(location.href)
  const form = document.querySelector<HTMLFormElement>('#document-filters')!
  const controls = mountCatalogControls(form, translate)
  searchInput = controls.searchInput
  categoryFilter = controls.categoryFilter
  typeFilter = controls.typeFilter
  clearButton = controls.clearButton
  undoButton = controls.undoButton
  setClearDisabled = disabled => controls.setClearDisabled(disabled)
  retryButton = controls.retryButton
  loadStatus = controls.loadStatus
  searchInput.value = url.searchParams.has('q')
    ? (url.searchParams.get('q') ?? '')
    : searchInput.value
  syncClearButton()
  const categories = [
    ...new Set(documents.map(document => document.category)),
  ].toSorted()
  const types = [...new Set(documents.map(document => document.type))].toSorted(
    (left, right) =>
      documentTypeLabel(left).localeCompare(documentTypeLabel(right)),
  )
  addOptions(categoryFilter, categories)
  addOptions(typeFilter, types, type => documentTypeLabel(type))
  categoryFilter.value = url.searchParams.get('category') ?? ''
  typeFilter.value = url.searchParams.get('type') ?? ''
  initializeGuideControls()
  bindCatalogEvents()
  if (!url.searchParams.has('q') && searchInput.value.trim()) {
    saveUrlState()
  }
  searchInput.placeholder = translate('searchPlaceholder')
  await loadDocuments(documents)
}

initializeLocale()
addEventListener('guide-locale-change', () => {
  searchInput.placeholder = translate('searchPlaceholder')
  document.title = translate('documentsPageTitle')
  document.dispatchEvent(new Event('guide-controls-sync'))
  updateResults(false)
  if (indexReady) {
    updateLoadStatus()
  }
})
void initialize()
