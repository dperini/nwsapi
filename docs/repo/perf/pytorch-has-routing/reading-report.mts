import { readingMarkup } from './markdown.mts'
import { localizeText } from './locale-content.mts'

export function reportMarkup(source: string, locale: 'en' | 'it') {
  const report = new DOMParser().parseFromString(source, 'text/html')
  const main = report.querySelector('main')!
  const widths = Array.from(main.querySelectorAll<HTMLElement>('.bar'), bar =>
    Number.parseFloat(bar.style.width),
  )
  const article = document.createElement('div')
  article.innerHTML = readingMarkup(main.innerHTML)
  // Restore only numeric chart widths after stripping the standalone report styles.
  article.querySelectorAll<HTMLElement>('.bar').forEach((bar, index) => {
    const width = widths[index]
    if (width !== undefined && Number.isFinite(width)) {
      bar.style.width = `${Math.max(0, Math.min(100, width))}%`
    }
  })
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (!node.parentElement?.closest('pre, code')) {
      node.data = localizeText(node.data, locale)
    }
  }
  return article.innerHTML
}
