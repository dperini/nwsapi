// Copied from wheelhouse’s named-blocks helper, limited to plain tags for use before installation.
// The balanced stack and block extraction retain its nested-region behavior.

export interface NamedBlock {
  readonly tag: string
  // 0-based line index of the BEGIN marker.
  readonly beginLine: number
  // 0-based line index of the END marker.
  readonly endLine: number
  // Nesting depth (0 = top level).
  readonly depth: number
  readonly children: readonly NamedBlock[]
}

export type MalformedKind = 'mismatch' | 'orphan-end' | 'unclosed'

export interface Malformed {
  readonly kind: MalformedKind
  readonly tag: string
  // 0-based line index of the offending marker.
  readonly line: number
  readonly message: string
}

export interface ParsedBlocks {
  // Top-level blocks; nested blocks hang off each block's `children`.
  readonly roots: readonly NamedBlock[]
  readonly malformed: readonly Malformed[]
  readonly wellFormed: boolean
}

export interface MarkerLine {
  readonly kind: 'begin' | 'end'
  readonly tag: string
  // 0-based line index.
  readonly line: number
}

interface OpenFrame {
  tag: string
  beginLine: number
  children: NamedBlock[]
}

const MARKER_RE =
  /^\s*(?:#+|<!--|\/\/)\s*(?:(BEGIN|END)\s+)?<(\/?)([A-Za-z][A-Za-z0-9-]*)>\s*(?:-->)?\s*$/i

export function scanMarkers(content: string): MarkerLine[] {
  const markers: MarkerLine[] = []
  const lines = content.split(/\r?\n/)
  for (const [line, text] of lines.entries()) {
    const match = MARKER_RE.exec(text)
    if (!match) {
      continue
    }
    const kind = match[2] ? 'end' : 'begin'
    if (
      match[1] &&
      match[1].toLowerCase() !== (kind === 'begin' ? 'begin' : 'end')
    ) {
      continue
    }
    markers.push({ kind, tag: match[3]!.toLowerCase(), line })
  }
  return markers
}

export function parseNamedBlocks(content: string): ParsedBlocks {
  const markers = scanMarkers(content)
  const malformed: Malformed[] = []
  const roots: NamedBlock[] = []
  const stack: OpenFrame[] = []
  for (let i = 0, { length } = markers; i < length; i += 1) {
    const marker = markers[i]!
    if (marker.kind === 'begin') {
      stack.push({
        tag: marker.tag,
        beginLine: marker.line,
        children: [],
      })
      continue
    }
    if (stack.length === 0) {
      malformed.push({
        kind: 'orphan-end',
        tag: marker.tag,
        line: marker.line,
        message: `END </${marker.tag}> (line ${marker.line + 1}) has no open BEGIN.`,
      })
      continue
    }
    const top = stack[stack.length - 1]!
    if (top.tag !== marker.tag) {
      malformed.push({
        kind: 'mismatch',
        tag: marker.tag,
        line: marker.line,
        message: `END </${marker.tag}> (line ${marker.line + 1}) does not close the open <${top.tag}> (line ${top.beginLine + 1}); blocks must nest, not overlap.`,
      })
      continue
    }
    stack.pop()
    const block: NamedBlock = {
      tag: top.tag,
      beginLine: top.beginLine,
      endLine: marker.line,
      depth: stack.length,
      children: top.children,
    }
    if (stack.length === 0) {
      roots.push(block)
    } else {
      stack[stack.length - 1]!.children.push(block)
    }
  }
  for (let i = 0, { length } = stack; i < length; i += 1) {
    const frame = stack[i]!
    malformed.push({
      kind: 'unclosed',
      tag: frame.tag,
      line: frame.beginLine,
      message: `BEGIN <${frame.tag}> (line ${frame.beginLine + 1}) is never closed.`,
    })
  }
  return { roots, malformed, wellFormed: malformed.length === 0 }
}

/**
 * Depth-first flatten of a block tree into a single list (parents before
 * children).
 */
export function flattenBlocks(roots: readonly NamedBlock[]): NamedBlock[] {
  const out: NamedBlock[] = []
  const queue: NamedBlock[] = [...roots]
  while (queue.length) {
    const block = queue.shift()!
    out.push(block)
    queue.unshift(...block.children)
  }
  return out
}

/**
 * Find every block with the given tag (case-insensitive), at any nesting depth.
 * Returns an empty list when the content is malformed.
 */
export function findBlocksByTag(content: string, tag: string): NamedBlock[] {
  const parsed = parseNamedBlocks(content)
  if (!parsed.wellFormed) {
    return []
  }
  const wanted = tag.toLowerCase()
  return flattenBlocks(parsed.roots).filter(block => block.tag === wanted)
}

export function extractBlockByTag(
  content: string,
  tag: string,
): string | undefined {
  const blocks = findBlocksByTag(content, tag)
  if (blocks.length !== 1) {
    return undefined
  }
  const block = blocks[0]!
  return content
    .split(/\r?\n/)
    .slice(block.beginLine, block.endLine + 1)
    .join('\n')
}
