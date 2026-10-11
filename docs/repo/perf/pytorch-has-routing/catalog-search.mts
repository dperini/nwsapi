import type {
  IndexedDocument,
  SearchResult,
  Section,
} from './catalog-index.mts'

type Range = { start: number; end: number }
type Word = Range & { value: string }
type Field = { text: string; folded: string; words?: Word[]; section?: Section }
type Match = { quality: number; ranges: Range[] }
const fields = new WeakMap<IndexedDocument, Field[]>()

function fold(text: string) {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[_\-\s]+/g, ' ')
}

function words(text: string): Word[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}\p{M}]+/gu), match => ({
    value: fold(match[0]),
    start: match.index,
    end: match.index + match[0].length,
  }))
}

function vocabulary(text: string) {
  const unique = new Map<string, Word>()
  for (const word of words(text)) {
    if (!unique.has(word.value)) {
      unique.set(word.value, word)
    }
  }
  return Array.from(unique.values())
}

function nearWord(left: string, right: string) {
  if (left === right) {
    return true
  }
  const a = Array.from(left)
  const b = Array.from(right)
  if (a.length < 4 || Math.abs(a.length - b.length) > 1) {
    return false
  }
  let index = 0
  while (index < a.length && a[index] === b[index]) {
    index += 1
  }
  if (a.length === b.length) {
    return (
      a.slice(index + 1).join('') === b.slice(index + 1).join('') ||
      (a[index] === b[index + 1] &&
        a[index + 1] === b[index] &&
        a.slice(index + 2).join('') === b.slice(index + 2).join(''))
    )
  }
  return a.length > b.length
    ? a.slice(index + 1).join('') === b.slice(index).join('')
    : a.slice(index).join('') === b.slice(index + 1).join('')
}

function sourceRange(text: string, start: number, end: number): Range {
  let source = 0
  let offset = 0
  let previousSpace = false
  const range = { start: 0, end: 0 }
  for (const character of text) {
    let normalized = fold(character)
    if (normalized === ' ' && previousSpace) {
      normalized = ''
    }
    if (normalized) {
      previousSpace = normalized === ' '
    }
    if (offset <= start && offset + normalized.length > start) {
      range.start = source
    }
    if (offset < end || (offset === end && /\p{M}/u.test(character))) {
      range.end = source + character.length
    } else {
      break
    }
    offset += normalized.length
    source += character.length
  }
  return range
}

function matchField(
  field: Field,
  query: string,
  terms: Word[],
): Match | undefined {
  const index = field.folded.indexOf(query)
  if (index >= 0) {
    return {
      quality: 0,
      ranges: [sourceRange(field.text, index, index + query.length)],
    }
  }
  // Selector punctuation stays literal so :has() does not become an ordinary word.
  if (!terms.length || terms.length > 16 || /[^\p{L}\p{N} ]/u.test(query)) {
    return undefined
  }
  field.words ??= vocabulary(field.text)
  const ranges: Range[] = []
  let quality = 1
  for (const term of terms) {
    let match = field.words.find(word => word.value === term.value)
    if (!match) {
      match = field.words.find(word => nearWord(term.value, word.value))
      quality = 2
    }
    if (!match) {
      return undefined
    }
    ranges.push(match)
  }
  return {
    quality,
    ranges: ranges.toSorted((left, right) => left.start - right.start),
  }
}

function prepareField(text: string, section?: Section): Field {
  return { text, folded: fold(text), ...(section ? { section } : {}) }
}

function documentFields(document: IndexedDocument) {
  let cached = fields.get(document)
  if (!cached) {
    cached = [
      prepareField(document.title),
      prepareField(document.summary),
      ...document.sections.map(section => prepareField(section.title, section)),
      ...document.sections.map(section => prepareField(section.text, section)),
      prepareField(document.body),
    ]
    fields.set(document, cached)
  }
  return cached
}

function excerpt(text: string, match: Match) {
  const first = match.ranges[0]!
  const start = Math.max(0, first.start - 85)
  const end = Math.min(text.length, first.end + 135)
  return `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

export function searchDocument(
  document: IndexedDocument,
  query: string,
): SearchResult | undefined {
  const needle = fold(query).trim()
  if (!needle) {
    return { document, rank: 0 }
  }
  const terms = words(needle)
  const candidates = documentFields(document)
  let best: SearchResult | undefined
  for (const [index, candidate] of candidates.entries()) {
    const match = matchField(candidate, needle, terms)
    if (!match) {
      continue
    }
    const scope =
      index < 2
        ? index
        : index < 2 + document.sections.length
          ? 2
          : index < candidates.length - 1
            ? 3
            : 4
    const rank = match.quality * 5 + scope
    if (!best || rank < best.rank) {
      best = {
        document,
        rank,
        ...(candidate.section ? { section: candidate.section } : {}),
        ...(index >= 2 ? { excerpt: excerpt(candidate.text, match) } : {}),
      }
    }
    if (match.quality === 0) {
      break
    }
  }
  return best
}

export function getHighlightRanges(text: string, query: string): Range[] {
  const needle = fold(query).trim()
  if (!needle) {
    return []
  }
  const candidate = prepareField(text)
  const ranges: Range[] = []
  let offset = candidate.folded.indexOf(needle)
  while (offset >= 0) {
    ranges.push(sourceRange(text, offset, offset + needle.length))
    offset = candidate.folded.indexOf(needle, offset + needle.length)
  }
  return ranges.length
    ? ranges
    : (matchField(candidate, needle, words(needle))?.ranges ?? [])
}
