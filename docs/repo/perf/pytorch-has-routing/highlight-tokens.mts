import { codeToTokens, isSupportedLanguage } from '@pierre/highlights'
import type { Theme } from '@pierre/highlights'

const colors = {
  plain: '#ffffff',
  comment: '#a7bac4',
  string: '#b4ebc9',
  number: '#ffcf86',
  keyword: '#c5b7ff',
  function: '#9adef3',
  operator: '#f1b8d0',
}
// Palette keys map tokens to the existing CSS classes for all appearance modes.
const kinds = new Map(
  Object.entries(colors).map(([kind, color]) => [color, kind]),
)
const theme: Theme = {
  name: 'Guide syntax classes',
  appearance: 'dark',
  style: {
    'editor.foreground': colors.plain,
    syntax: {
      ...colors,
      constant: colors.number,
      boolean: colors.number,
      type: colors.keyword,
      constructor: colors.function,
      'keyword.operator': colors.operator,
    },
  },
}

export interface HighlightSpan {
  start: number
  end: number
  type: string
}

export function parse(source: string, language: string): HighlightSpan[] {
  const lang = isSupportedLanguage(language) ? language : 'plain'
  const { tokens } = codeToTokens(source, { lang, theme })
  const spans: HighlightSpan[] = []
  let cursor = 0
  for (const line of tokens) {
    for (const token of line) {
      const end = token.offset + token.content.length
      if (
        !Number.isSafeInteger(token.offset) ||
        token.offset < cursor ||
        end > source.length ||
        source.slice(token.offset, end) !== token.content
      ) {
        throw new Error('Highlighted tokens do not match the source')
      }
      if (token.offset > cursor) {
        spans.push({ start: cursor, end: token.offset, type: 'plain' })
      }
      if (end > token.offset) {
        spans.push({
          start: token.offset,
          end,
          type: kinds.get(token.color ?? '') ?? 'plain',
        })
      }
      cursor = end
    }
  }
  if (cursor < source.length) {
    spans.push({ start: cursor, end: source.length, type: 'plain' })
  }
  return spans
}
