import type { NativeMatcher } from '../native/types.mts'

type SlottedArgument = { selector: string } | { selector: null }

export function hasSlottedArguments(
  selector: string,
  occurrences: RegExpExecArray[],
): SlottedArgument[] | undefined {
  const arguments_: SlottedArgument[] = []
  const nestedPattern = /:\s*has-slotted\b/gi
  for (
    let occurrenceIndex = 0, occurrenceLength = occurrences.length;
    occurrenceIndex < occurrenceLength;
    occurrenceIndex++
  ) {
    const occurrence = occurrences[occurrenceIndex]!
    let index = occurrence.index + occurrence[0].length
    while (index < selector.length && /\s/.test(selector[index]!)) {
      index++
    }
    if (selector[index] !== '(') {
      arguments_.push({ selector: null })
    } else {
      const end = closingParen(selector, index)
      if (end === undefined) {
        return undefined
      }
      const argument = selector.slice(index + 1, end).trim()
      if (
        !argument ||
        selectorPseudoCandidates(argument, nestedPattern).length > 0
      ) {
        return undefined
      }
      arguments_.push({ selector: argument })
    }
  }
  return arguments_.length ? arguments_ : undefined
}

// eslint-disable-next-line complexity -- Each branch is a distinct CSS lexical state.
export function closingParen(source: string, open: number): number | undefined {
  let depth = 1
  let brackets = 0
  let quote = ''
  for (let index = open + 1, length = source.length; index < length; index++) {
    const char = source[index]!
    if (char === '\\') {
      index++
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2)
      if (close === -1) {
        return source.length
      }
      index = close + 1
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
    } else if (char === '[') {
      brackets++
    } else if (char === ']') {
      brackets--
      if (brackets < 0) {
        return undefined
      }
    } else if (brackets === 0 && char === '(') {
      depth++
    } else if (brackets === 0 && char === ')') {
      depth--
      if (depth === 0) {
        return index
      }
    }
  }
  return undefined
}

// eslint-disable-next-line complexity -- One pass tracks comments, strings, escapes, and bracket depth.
export function selectorPseudoCandidates(
  source: string,
  pattern: RegExp,
): RegExpExecArray[] {
  const candidates: RegExpExecArray[] = []
  let quote = ''
  let brackets = 0
  for (let index = 0, length = source.length; index < length; index++) {
    const char = source[index]!
    if (char === '\\') {
      index++
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2)
      if (close === -1) {
        break
      }
      index = close + 1
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '[') {
      brackets++
      continue
    }
    if (char === ']') {
      brackets = Math.max(0, brackets - 1)
      continue
    }
    if (
      brackets !== 0 ||
      char !== ':' ||
      (index > 0 && source[index - 1] === ':')
    ) {
      continue
    }
    pattern.lastIndex = index
    const candidate = pattern.exec(source)
    if (candidate?.index === index) {
      candidates.push(candidate)
    }
  }
  return candidates
}

// eslint-disable-next-line complexity -- Comment removal must preserve CSS token boundaries across lexical states.
export function selectorArgumentWithoutComments(source: string): string {
  let output = ''
  let quote = ''
  const brackets: string[] = []
  for (let index = 0, length = source.length; index < length; index++) {
    const char = source[index]!
    if (char === '\\') {
      output += char + (source[index + 1] ?? '')
      index++
      continue
    }
    if (quote) {
      output += char
      if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2)
      const after = close === -1 ? source.length : close + 2
      const previous = output[output.length - 1]
      const next = source[after]
      const nameLike = (value: string | undefined) =>
        value !== undefined && /[\w\\\u0080-\uFFFF-]/.test(value)
      if ((nameLike(previous) || previous === '#') && nameLike(next)) {
        output += brackets[brackets.length - 1] === ']' ? ' ' : '!'
      }
      if (close === -1) {
        break
      }
      index = close + 1
      continue
    }
    output += char
    if (char === '"' || char === "'") {
      quote = char
    } else if (char === '[') {
      brackets.push(']')
    } else if (brackets[brackets.length - 1] === char) {
      brackets.pop()
    }
  }
  return output
}

export function hasAssignedMatch(
  slot: HTMLSlotElement,
  argument: SlottedArgument,
  matchesNative: NativeMatcher,
): boolean | undefined {
  const assigned = slot.assignedNodes()
  if (argument.selector === null) {
    return assigned.length > 0
  }
  for (let index = 0, length = assigned.length; index < length; index++) {
    const node = assigned[index]!
    if (node.nodeType !== 1) {
      continue
    }
    const matched = matchesNative(node as Element, argument.selector)
    if (matched === undefined) {
      return undefined
    }
    if (matched) {
      return true
    }
  }
  return false
}

export function units(value: string): Uint16Array {
  const result = new Uint16Array(value.length)
  for (let i = 0, length = value.length; i < length; i++) {
    result[i] = value.charCodeAt(i)
  }
  return result
}

export function customStateNames(selector: string): string[] | undefined {
  const names: string[] = []
  const normalized = selectorArgumentWithoutComments(selector)
  const occurrences = statePseudoOccurrences(normalized)
  for (let index = 0, length = occurrences.length; index < length; index++) {
    const { open } = occurrences[index]!
    const close = closingParen(normalized, open)
    if (close === undefined) {
      return undefined
    }
    const argument = normalized.slice(open + 1, close).trim()
    const name = decodeCssIdentifier(argument)
    if (name === undefined) {
      return undefined
    }
    names.push(name)
  }
  return names.length ? names : undefined
}

function decodeCssIdentifier(source: string): string | undefined {
  source = source.replace(/\0/g, '\ufffd')
  const decoded = parseCssIdentifier(source, 0)
  return decoded?.end === source.length ? decoded.value : undefined
}

// eslint-disable-next-line complexity -- CSS identifier escapes require distinct code-point and hex-escape branches.
function parseCssIdentifier(
  source: string,
  start: number,
): { value: string; end: number } | undefined {
  let index = start
  let decoded = ''
  const codePointAt = (offset: number) => source.codePointAt(offset)
  const isStart = (point: number | undefined) =>
    point !== undefined &&
    (point >= 0x80 ||
      point === 0x5f ||
      (point >= 0x41 && point <= 0x5a) ||
      (point >= 0x61 && point <= 0x7a))
  const isName = (point: number | undefined) =>
    isStart(point) ||
    point === 0x2d ||
    (point !== undefined && point >= 0x30 && point <= 0x39)
  const isHex = (char: string | undefined) =>
    char !== undefined && /^[0-9a-f]$/i.test(char)
  const isCssWhitespace = (point: number | undefined) =>
    point === 0x20 ||
    point === 0x09 ||
    point === 0x0a ||
    point === 0x0c ||
    point === 0x0d

  const first = codePointAt(index)
  if (first === 0x2d) {
    const second = codePointAt(index + 1)
    if (second === 0x2d) {
      decoded = '-'
      index++
    } else if (!isStart(second) && source[index + 1] !== '\\') {
      return undefined
    }
  } else if (!isStart(first) && source[index] !== '\\') {
    return undefined
  }

  const length = source.length
  while (index < length) {
    const point = codePointAt(index)
    if (source[index] === '\\') {
      const next = source[index + 1]
      if (next === undefined || /[\n\r\f]/.test(next)) {
        return undefined
      }
      if (isHex(next)) {
        let end = index + 1
        while (end < source.length && end < index + 7 && isHex(source[end])) {
          end++
        }
        const escaped = Number.parseInt(source.slice(index + 1, end), 16)
        decoded +=
          escaped === 0 ||
          escaped > 0x10ffff ||
          (escaped >= 0xd800 && escaped <= 0xdfff)
            ? '\ufffd'
            : String.fromCodePoint(escaped)
        if (isCssWhitespace(codePointAt(end))) {
          end += source[end] === '\r' && source[end + 1] === '\n' ? 2 : 1
        }
        index = end
        continue
      }
      decoded += next
      index += 2
      continue
    }
    if (!isName(point)) {
      break
    }
    if (point! >= 0xd800 && point! <= 0xdfff) {
      decoded += '\ufffd'
      index++
      continue
    }
    decoded += String.fromCodePoint(point!)
    index += point! > 0xffff ? 2 : 1
  }
  return index > start ? { value: decoded, end: index } : undefined
}

// eslint-disable-next-line complexity -- One pass identifies functional pseudo tokens while respecting CSS lexical states.
export function statePseudoOccurrences(
  source: string,
): Array<{ open: number }> {
  const occurrences: Array<{ open: number }> = []
  let quote = ''
  let brackets = 0
  for (let index = 0, length = source.length; index < length; index++) {
    const char = source[index]!
    if (char === '\\') {
      index++
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '[') {
      brackets++
      continue
    }
    if (char === ']') {
      brackets = Math.max(0, brackets - 1)
      continue
    }
    if (
      brackets !== 0 ||
      char !== ':' ||
      (index > 0 && source[index - 1] === ':')
    ) {
      continue
    }
    let nameStart = index + 1
    while (/\s/.test(source[nameStart] ?? '')) {
      nameStart++
    }
    const name = parseCssIdentifier(source, nameStart)
    if (
      name?.value.replace(/[A-Z]/g, letter => letter.toLowerCase()) !== 'state'
    ) {
      continue
    }
    let next = name.end
    while (/\s/.test(source[next] ?? '')) {
      next++
    }
    if (source[next] === '(') {
      occurrences.push({ open: next })
    }
  }
  return occurrences
}
