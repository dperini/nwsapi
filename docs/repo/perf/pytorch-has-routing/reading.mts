/// <reference types="vite/client" />
import { Marked } from 'marked'
import { element, escapeHtml } from './ui.mts'
import { initializeHighlighting } from './highlight.mts'

const documents = import.meta.glob<string>(
  [
    '../neural-dispatch-crossed-outcome.md',
    '../neural-dispatch-jit-outcome.md',
    '../pytorch-for-beginners.md',
    '../neural-dispatch-crossed-plan.md',
    '../neural-dispatch-jit-plan.md',
    '../neural-dispatch-jit-tasks.md',
    '../neural-planner-integration.md',
  ],
  { query: '?raw', import: 'default', eager: true },
)
const reports = import.meta.glob<string>(
  [
    '../../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-crossed-2026-10-05.html',
    '../../../../assets/repo/bench/survey-2026-10-03/neural-dispatch-jit-2026-10-05.html',
  ],
  { query: '?url', import: 'default', eager: true },
)
const repository = 'https://github.com/dperini/nwsapi'
const revision = 'prerelease/3.0.0'
const sourceBase = new URL('https://guide.invalid/docs/repo/perf/')
const labels: Record<string, string> = {
  'neural-dispatch-crossed-outcome': 'Crossed-query results',
  'neural-dispatch-jit-outcome': 'Dispatch follow-up',
  'pytorch-for-beginners': 'Text guide',
  'neural-dispatch-crossed-plan': 'Measurement plan',
  'neural-dispatch-jit-plan': 'Dispatch plan',
  'neural-dispatch-jit-tasks': 'Further work',
  'neural-planner-integration': 'Implementation notes',
}
const markdown = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text)
    },
  },
})

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
  const slug = name.replace(/\.md$/, '')
  if (
    url.pathname.startsWith(sourceBase.pathname) &&
    documents[`../${slug}.md`]
  ) {
    return documentHref(slug) + url.hash
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
}

function prepareTables(article: HTMLElement) {
  for (const table of article.querySelectorAll('table')) {
    const wrapper = document.createElement('div')
    wrapper.className = 'table-scroll'
    wrapper.tabIndex = 0
    wrapper.setAttribute('role', 'region')
    wrapper.setAttribute(
      'aria-label',
      'Comparison table, scroll for more columns',
    )
    table.before(wrapper)
    wrapper.append(table)
  }
}

function createContents(article: HTMLElement) {
  const contents = element('reading-contents')
  const navigation = element('reading-navigation') as HTMLDetailsElement
  const mobile = matchMedia('(max-width: 900px)')
  const resize = () => {
    navigation.open = !mobile.matches
  }
  mobile.addEventListener('change', resize)
  resize()
  const used = new Map<string, number>()
  const headings = Array.from(article.querySelectorAll<HTMLElement>('h2, h3'))
  for (const heading of headings) {
    const title = heading.textContent ?? ''
    const base =
      title
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
}

function renderDocument(slug: string, source: string) {
  const article = element('reading-content')
  // Only bundled repository documents enter the renderer, never URL-provided text.
  article.innerHTML = markdown.parse(source, { async: false })
  article.removeAttribute('aria-busy')
  const title = article.querySelector('h1')?.textContent ?? labels[slug]!
  document.title = `${title} · NWSAPI model guide`
  element('reading-label').textContent = labels[slug] ?? 'Further reading'
  const minutes = Math.max(
    1,
    Math.ceil((article.textContent ?? '').split(/\s+/).length / 220),
  )
  element('reading-time').textContent = `${minutes} min read`
  const sourceLink = element('reading-source-link') as HTMLAnchorElement
  sourceLink.href = `${repository}/blob/${revision}/docs/repo/perf/${slug}.md`
  sourceLink.parentElement!.hidden = false
  prepareLinks(article)
  prepareTables(article)
  const headings = createContents(article)
  followReading(headings)
  initializeHighlighting()
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    '.reading-related a',
  )) {
    if (new URL(link.href).searchParams.get('doc') === slug) {
      link.hidden = true
    }
  }
  requestAnimationFrame(() => {
    document.getElementById(location.hash.slice(1))?.scrollIntoView()
  })
}

function openDocument() {
  const slug =
    new URLSearchParams(location.search).get('doc') ?? 'pytorch-for-beginners'
  const source = documents[`../${slug}.md`]
  if (!source) {
    const article = element('reading-content')
    article.removeAttribute('aria-busy')
    article.innerHTML =
      '<h1>Document not found</h1><p>Choose one of the reading links below, or return to the guide.</p>'
    document.querySelector<HTMLElement>('.reading-sidebar')!.hidden = true
    document.title = 'Document not found · NWSAPI model guide'
    return
  }
  renderDocument(slug, source)
}

openDocument()
