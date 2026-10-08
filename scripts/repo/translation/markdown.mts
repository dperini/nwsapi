import { lexer, Lexer } from 'marked'
import type { Token } from 'marked'

export type Recipe = string | { text: string; slots: Recipe[]; indent?: string }
export const requests = new Set<string>()

export function phrase(source: string, slots: Recipe[] = []): Recipe {
  const text = source.replace(/\s+/g, ' ').trim()
  if (!/[a-z]{2,}/i.test(text.replace(/ZXQ\d+QXZ/g, ''))) {
    return { text, slots }
  }
  requests.add(text)
  return { text, slots }
}

export function inline(source: string): Recipe {
  const parts = source.split(
    /(<(?:code|pre|script|style)\b[^>]*>[\s\S]*?<\/(?:code|pre|script|style)\s*>)/gi,
  )
  return parts.length > 1
    ? join(parts.map((part, index) => (index % 2 ? part : spacedInline(part))))
    : inlineText(source)
}

function inlineText(source: string): Recipe {
  const slots: Recipe[] = []
  let text = ''
  for (const token of Lexer.lexInline(source)) {
    if (token.type === 'text') {
      text += token.raw
      continue
    }
    let value: Recipe = token.raw
    if (
      'text' in token &&
      ['strong', 'em', 'del', 'link'].includes(token.type)
    ) {
      const start = token.raw.indexOf(token.text)
      value = {
        text:
          token.raw.slice(0, start) +
          'ZXQ0QXZ' +
          token.raw.slice(start + token.text.length),
        slots: [inline(token.text)],
      }
    }
    text += `ZXQ${slots.length}QXZ`
    slots.push(value)
  }
  text = text.replace(
    /\b\d+(?:[.,]\d+)*(?:[%×]|ms|ns|µs|px|MB|KB|GB|x)?\b/g,
    value => {
      const key = `ZXQ${slots.length}QXZ`
      slots.push(value)
      return key
    },
  )
  return phrase(text, slots)
}

function join(parts: Recipe[], separator = ''): Recipe {
  return {
    text: parts.map((_, index) => `ZXQ${index}QXZ`).join(separator),
    slots: parts,
  }
}

function table(token: Extract<Token, { type: 'table' }>): Recipe {
  const row = (cells: Array<{ text: string }>) => ({
    text: '| ' + cells.map((_, index) => `ZXQ${index}QXZ`).join(' | ') + ' |\n',
    slots: cells.map(cell => inline(cell.text)),
  })
  const separator =
    '| ' +
    token.align
      .map(align =>
        align === 'right' ? '---:' : align === 'center' ? ':---:' : '---',
      )
      .join(' | ') +
    ' |\n'
  return join([row(token.header), separator, ...token.rows.map(row)])
}

function list(token: Extract<Token, { type: 'list' }>): Recipe {
  const parts: Recipe[] = []
  token.items.forEach((item, index) => {
    const marker = token.ordered ? `${Number(token.start) + index}. ` : '- '
    const check = item.task ? `[${item.checked ? 'x' : ' '}] ` : ''
    const nested = blocks(item.tokens)
    parts.push({
      text: marker + check + 'ZXQ0QXZ',
      slots: [nested],
      indent: ' '.repeat(marker.length),
    })
    if (index < token.items.length - 1) {
      parts.push(token.loose ? '\n\n' : '\n')
    }
  })
  return join(parts)
}

function htmlRecipe(source: string): Recipe {
  const parts: Recipe[] = []
  const markup =
    /<(?:code|pre|script|style)\b[^>]*>[\s\S]*?<\/(?:code|pre|script|style)\s*>|<!--[\s\S]*?-->|<[^>]*>/gi
  let start = 0
  for (const match of source.matchAll(markup)) {
    parts.push(spacedInline(source.slice(start, match.index)))
    parts.push(match[0])
    start = match.index + match[0].length
  }
  parts.push(spacedInline(source.slice(start)))
  return join(parts)
}

function spacedInline(text: string): Recipe {
  return text.trim()
    ? join([
        text.match(/^\s*/)?.[0] ?? '',
        inlineText(text),
        text.match(/\s*$/)?.[0] ?? '',
      ])
    : text
}

function block(token: Token): Recipe {
  const tail = token.raw.match(/\n*$/)?.[0] ?? ''
  if (token.type === 'heading') {
    return join(['#'.repeat(token.depth) + ' ', inline(token.text), tail])
  }
  if (token.type === 'paragraph' || token.type === 'text') {
    return join([inline(token.text), tail])
  }
  if (
    token.type === 'table' &&
    'align' in token &&
    'header' in token &&
    'rows' in token
  ) {
    return table(token as Extract<Token, { type: 'table' }>)
  }
  if (token.type === 'list' && 'items' in token) {
    return join([list(token as Extract<Token, { type: 'list' }>), tail])
  }
  if (token.type === 'blockquote' && token.tokens) {
    return {
      text: '> ZXQ0QXZ' + tail,
      slots: [blocks(token.tokens)],
      indent: '> ',
    }
  }
  if (token.type === 'html') {
    return htmlRecipe(token.raw)
  }
  return token.raw
}

export function blocks(tokens: Token[]): Recipe {
  return join(tokens.map(block))
}

export function markdownRecipe(source: string) {
  return blocks(lexer(source))
}

export function renderRecipe(
  recipe: Recipe,
  translations: Record<string, string>,
): string {
  if (typeof recipe === 'string') {
    return recipe
  }
  const text = translations[recipe.text] ?? recipe.text
  const rendered = text.replace(/ZXQ(\d+)QXZ/g, (_raw, number: string) => {
    const slot = recipe.slots[Number(number)]
    if (slot === undefined) {
      throw new Error(`Unresolved translation slot: ${number}`)
    }
    return renderRecipe(slot, translations)
  })
  return recipe.indent
    ? rendered.replace(/\n(?=.)/g, '\n' + recipe.indent)
    : rendered
}
