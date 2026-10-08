/// <reference types="vite/client" />
import { Marked } from 'marked'
import { element } from './ui.mts'
import { readingMarkup } from './markdown.mts'
import { initializeHighlighting } from './highlight.mts'
import { initializeLinkMarkers } from './links.mts'
import { currentLocale, initializeLocale, translate } from './locale.mts'
import { localizeText } from './locale-content.mts'

const documentLoaders = import.meta.glob<string>(
  ['../../../**/*.md', '../../../../README.md'],
  { query: '?raw', import: 'default' },
)
const documents = Object.fromEntries(
  Object.entries(documentLoaders).map(([file, load]) => [
    new URL(
      file,
      'https://guide.invalid/docs/repo/perf/pytorch-has-routing/',
    ).pathname.slice(1),
    load,
  ]),
)
let documentPath = 'docs/repo/perf/pytorch-for-beginners.md'
let sourceBase = new URL('https://guide.invalid/' + documentPath)
let renderRequest = 0
let stopFollowing: (() => void) | undefined
let originalHeadings: string[] = []
const reports = import.meta.glob<string>(
  [
    '../../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-crossed-2026-10-05.html',
    '../../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-jit-2026-10-05.html',
  ],
  { query: '?url', import: 'default', eager: true },
)
const repository = 'https://github.com/dperini/nwsapi'
const revision = 'prerelease/3.0.0'
const labels: Record<string, string> = {
  'neural-dispatch-crossed-outcome': 'Crossed-query results',
  'neural-dispatch-jit-outcome': 'Dispatch follow-up',
  'pytorch-for-beginners': 'Text guide',
  'neural-dispatch-crossed-plan': 'Measurement plan',
  'neural-dispatch-jit-plan': 'Dispatch plan',
  'neural-dispatch-jit-tasks': 'Further work',
  'neural-planner-integration': 'Implementation notes',
}
const markdown = new Marked({ gfm: true })

function documentHref(slug: string) {
  return `./model-guide-reading.html?doc=${encodeURIComponent(slug)}`
}

function reportHref(url: URL) {
  const name = url.pathname.split('/').pop()
  const entry = Object.entries(reports).find(([path]) =>
    path.endsWith(`/${name}`),
  )
  return entry ? entry[1] + url.hash : undefined
}

function resolveLink(href: string): string | undefined {
  const url = new URL(href, sourceBase)
  if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) {
    return undefined
  }
  if (href.startsWith('#')) {
    return href
  }
  if (url.hostname.endsWith('.localhost') || url.origin === sourceBase.origin) {
    const report = reportHref(url)
    if (report) {
      return report
    }
  }
  if (url.origin !== sourceBase.origin) {
    return href
  }
  const name = url.pathname.split('/').pop() ?? ''
  if (documents[url.pathname.slice(1)]) {
    return documentHref(url.pathname.slice(1)) + url.hash
  }
  if (name === 'pytorch-has-routing.html') {
    return './pytorch-has-routing.html' + url.hash
  }
  const view = url.pathname.endsWith('/') ? 'tree' : 'blob'
  return `${repository}/${view}/${revision}${url.pathname}${url.hash}`
}

function prepareLinks(article: HTMLElement) {
  for (const link of article.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = resolveLink(link.getAttribute('href')!)
    if (href) {
      link.setAttribute('href', href)
    } else {
      link.removeAttribute('href')
    }
  }
  for (const image of article.querySelectorAll<HTMLImageElement>('img[src]')) {
    const url = new URL(image.getAttribute('src')!, sourceBase)
    if (url.origin === sourceBase.origin) {
      image.src = `https://raw.githubusercontent.com/dperini/nwsapi/refs/heads/${revision}${url.pathname}${url.search}`
    }
    image.loading = 'lazy'
  }
}

function prepareTables(article: HTMLElement) {
  for (const table of article.querySelectorAll('table')) {
    const wrapper = document.createElement('div')
    wrapper.className = 'table-scroll'
    wrapper.tabIndex = 0
    wrapper.setAttribute('role', 'region')
    wrapper.setAttribute('aria-label', translate('comparisonTable'))
    table.before(wrapper)
    wrapper.append(table)
  }
}

function createContents(article: HTMLElement) {
  const contents = element('reading-contents')
  contents.replaceChildren()
  contents.dataset['localeContent'] = ''
  const navigation = element('reading-navigation') as HTMLDetailsElement
  const mobile = matchMedia('(max-width: 900px)')
  const resize = () => {
    navigation.open = !mobile.matches
  }
  resize()
  const used = new Map<string, number>()
  const headings = Array.from(article.querySelectorAll<HTMLElement>('h2, h3'))
  for (const [index, heading] of headings.entries()) {
    const title = heading.textContent ?? ''
    const base =
      (originalHeadings[index] ?? title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'section'
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    heading.id = count ? `${base}-${count}` : base
    const item = document.createElement('li')
    item.dataset['depth'] = heading.tagName.slice(1)
    const link = document.createElement('a')
    link.href = `#${heading.id}`
    link.textContent = title
    item.append(link)
    contents.append(item)
  }
  return headings
}

function followReading(headings: HTMLElement[]) {
  const links = Array.from(element('reading-contents').querySelectorAll('a'))
  let scheduled = false
  const update = () => {
    scheduled = false
    const last = document.documentElement.scrollHeight - innerHeight
    const progress = last > 0 ? Math.min(1, Math.max(0, scrollY / last)) : 1
    document.body.style.setProperty('--reading-progress', String(progress))
    let active = 0
    headings.forEach((heading, index) => {
      if (heading.getBoundingClientRect().top <= innerHeight * 0.3) {
        active = index
      }
    })
    links.forEach((link, index) => {
      if (index === active) {
        link.setAttribute('aria-current', 'location')
      } else {
        link.removeAttribute('aria-current')
      }
    })
  }
  const schedule = () => {
    if (!scheduled) {
      scheduled = true
      requestAnimationFrame(update)
    }
  }
  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)
  update()
  return () => {
    removeEventListener('scroll', schedule)
    removeEventListener('resize', schedule)
  }
}

function renderDocument(slug: string, source: string) {
  const article = element('reading-content')
  // Only bundled repository documents enter the renderer, never URL-provided text.
  article.dataset['localeContent'] = ''
  article.innerHTML = readingMarkup(markdown.parse(source, { async: false }))
  article.removeAttribute('aria-busy')
  const title = article.querySelector('h1')?.textContent ?? labels[slug]!
  document.title = `${title} · ${localizeText('NWSAPI model guide', currentLocale())}`
  element('reading-label').removeAttribute('data-i18n')
  element('reading-label').textContent = localizeText(
    labels[slug] ?? 'Further reading',
    currentLocale(),
  )
  const minutes = Math.max(
    1,
    Math.ceil((article.textContent ?? '').split(/\s+/).length / 220),
  )
  element('reading-time').textContent = translate('readMinutes').replace(
    '{minutes}',
    new Intl.NumberFormat(currentLocale()).format(minutes),
  )
  const sourceLink = element('reading-source-link') as HTMLAnchorElement
  sourceLink.href = `${repository}/blob/${revision}/${documentPath}`
  sourceLink.parentElement!.hidden = false
  prepareLinks(article)
  initializeLinkMarkers()
  prepareTables(article)
  const headings = createContents(article)
  stopFollowing?.()
  stopFollowing = followReading(headings)
  initializeHighlighting()
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    '.reading-related a',
  )) {
    link.hidden = new URL(link.href).searchParams.get('doc') === slug
  }
  requestAnimationFrame(() => {
    document.getElementById(location.hash.slice(1))?.scrollIntoView()
  })
}

async function openDocument() {
  const request = ++renderRequest
  const slug =
    new URLSearchParams(location.search).get('doc') ?? 'pytorch-for-beginners'
  documentPath = Object.hasOwn(documents, slug)
    ? slug
    : `docs/repo/perf/${slug}.md`
  sourceBase = new URL('https://guide.invalid/' + documentPath)
  const load = documents[documentPath]
  if (!load) {
    const article = element('reading-content')
    article.removeAttribute('aria-busy')
    article.innerHTML = `<h1>${translate('documentNotFound')}</h1><p>${translate('documentNotFoundHelp')}</p>`
    document.querySelector<HTMLElement>('.reading-sidebar')!.hidden = true
    document.title = translate('documentNotFound')
    return
  }
  const source = await load()
  const headings = document.createElement('div')
  headings.innerHTML = readingMarkup(markdown.parse(source, { async: false }))
  originalHeadings = Array.from(
    headings.querySelectorAll('h2,h3'),
    node => node.textContent ?? '',
  )
  let translated = source
  if (currentLocale() === 'it') {
    const catalog = (
      await import('../../../../assets/repo/model-guide/locales/documents.it.generated.json')
    ).default as Record<string, { text: string }>
    translated = catalog[documentPath]?.text ?? source
  }
  if (request === renderRequest) {
    renderDocument(slug, translated)
  }
}

initializeLocale()
window.addEventListener('guide-locale-change', () => {
  void openDocument()
})
void openDocument()
