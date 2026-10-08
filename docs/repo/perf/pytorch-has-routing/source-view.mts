import { allowsMotion } from './reading-mode.mts'
import { sources } from './source.mts'
import type { SourceId } from './source.mts'
import { element, text } from './ui.mts'
import { code } from './highlight.mts'
import { highlightLinkedArea } from './panel-shimmer.mts'

export function revealSourceChoice() {
  const list = element('source-list')
  const button = list.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
  if (button && list.scrollWidth > list.clientWidth) {
    list.scrollTo({
      left: button.offsetLeft - (list.clientWidth - button.offsetWidth) / 2,
      behavior: 'instant',
    })
  }
}

export function showSource(id: SourceId) {
  const source = sources[id]
  text('source-role', source.role)
  text('source-title', source.title)
  text('source-explanation', source.explanation)
  code('source-code', source.code)
  const link = element('source-link') as HTMLAnchorElement
  link.href = `https://github.com/dperini/nwsapi/blob/prerelease/3.0.0/${source.path}`
  document
    .querySelectorAll<HTMLButtonElement>('[data-file]')
    .forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset['file'] === id))
    })
  revealSourceChoice()
}

export function jumpToSource(id: SourceId) {
  showSource(id)
  highlightLinkedArea(element('source-code'))
  element('source').scrollIntoView({
    behavior: !allowsMotion() ? 'instant' : 'smooth',
  })
}
