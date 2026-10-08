import { code } from './highlight.mts'
import { highlightSelector } from './selector.mts'
import { element, writeUnitText } from './ui.mts'

export type StoryReadout = {
  selector?: string
  facts?: Array<[string, string]>
  note?: string
  code?: string
}

export function renderStoryReadout(readout: StoryReadout) {
  const selector = element('story-query')
  selector.hidden = !readout.selector
  if (readout.selector) {
    highlightSelector(selector, readout.selector)
  }
  const facts = element('story-facts')
  facts.replaceChildren()
  facts.hidden = !readout.facts?.length
  for (const [label, value] of readout.facts ?? []) {
    const row = document.createElement('div')
    const term = document.createElement('dt')
    term.textContent = label
    const detail = document.createElement('dd')
    writeUnitText(detail, value)
    row.append(term, detail)
    facts.append(row)
  }
  const note = element('story-process')
  note.textContent = readout.note ?? ''
  note.hidden = !readout.note
  const snippet = element('story-code')
  snippet.hidden = !readout.code
  if (readout.code) {
    code('story-code', readout.code)
  }
}
