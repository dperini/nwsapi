function unwrapNonCapturingGroups(source: string): string {
  let value = source
  while (value.startsWith('(?:') && value.endsWith(')')) {
    let depth = 0
    let escaped = false
    let inClass = false
    let closesAtEnd = false
    let hasAlternation = false
    for (let index = 3, length = value.length; index < length; index++) {
      const char = value[index]!
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (inClass) {
        if (char === ']') {
          inClass = false
        }
      } else if (char === '[') {
        inClass = true
      } else if (char === '|') {
        hasAlternation = true
      } else if (char === '(') {
        depth++
      } else if (char === ')') {
        if (depth === 0) {
          closesAtEnd = index === value.length - 1
          break
        }
        depth--
      }
    }
    // Alternation changes meaning when a regex fragment is concatenated with
    // the attribute value, so only unwrap groups without an alternation.
    if (!closesAtEnd || hasAlternation) {
      break
    }
    value = value.slice(3, -1)
  }
  return value
}

// eslint-disable-next-line complexity -- Maps the built-in resolver signatures and encoded Rust modes.
export function nativeOperatorCode(
  operator: string,
  value: unknown,
): string | undefined {
  if (!/^[!#%&/<>?@]=$/.test(operator) || !value || typeof value !== 'object') {
    return undefined
  }
  const resolver = value as { p1?: unknown; p2?: unknown; p3?: unknown }
  if (resolver.p3 !== 'true' && resolver.p3 !== 'false') {
    return undefined
  }
  const signature = `${unwrapNonCapturingGroups(String(resolver.p1))}\u0000${unwrapNonCapturingGroups(String(resolver.p2))}`
  const mode = new Map([
    ['^\u0000$', '='],
    ['^\u0000', '^'],
    ['\u0000$', '$'],
    ['\u0000', '*'],
    ['^\u0000(-|$)', '|'],
    ['(^|[\\t\\n\\f\\r ])\u0000([\\t\\n\\f\\r ]|$)', '~'],
  ]).get(signature)
  if (mode) {
    const encodedMode =
      resolver.p3 === 'true'
        ? mode
        : mode === '='
          ? '!'
          : mode === '^'
            ? 'P'
            : mode === '$'
              ? 'S'
              : mode === '*'
                ? 'C'
                : mode === '|'
                  ? 'D'
                  : 'W'
    return operator + encodedMode
  }
  const prefix = literalRegexFragment(resolver.p1, 'prefix')
  const suffix = literalRegexFragment(resolver.p2, 'suffix')
  if (prefix === undefined || suffix === undefined) {
    return undefined
  }
  return `${operator}G${resolver.p3 === 'true' ? '1' : '0'}${prefix.anchor ? '^' : '-'}${prefix.tokens}:${suffix.anchor ? '$' : '-'}${suffix.tokens};`
}

// eslint-disable-next-line complexity -- Parses a bounded JS regex fragment in one left-to-right stateful scan.
function literalRegexFragment(
  value: unknown,
  side: 'prefix' | 'suffix',
): { tokens: string; anchor: boolean } | undefined {
  if (typeof value !== 'string' || value.length > 128) {
    return undefined
  }
  let anchor = side === 'prefix' && value.startsWith('^')
  const source = anchor ? value.slice(1) : value
  let tokens = ''
  const escapable = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'
  for (let index = 0, length = source.length; index < length; index++) {
    const char = source[index]!
    if (side === 'suffix' && char === '$' && index === source.length - 1) {
      anchor = true
      break
    }
    let literal: string | undefined
    if (char === '\\') {
      const escaped = source[++index]
      if (!escaped) {
        return undefined
      }
      if (/[dws]/i.test(escaped)) {
        const lower = escaped.toLowerCase()
        const classToken =
          escaped === lower
            ? lower
            : lower === 'd'
              ? 'n'
              : lower === 'w'
                ? 'm'
                : 't'
        const quantifier = source[index + 1]
        if (quantifier === '{') {
          const bounded = /^\{(\d+)(?:,(\d*))?\}/.exec(source.slice(index + 1))
          if (!bounded) {
            return undefined
          }
          const minimum = Number(bounded[1])
          const maximum =
            bounded[2] === undefined
              ? minimum
              : bounded[2] === ''
                ? undefined
                : Number(bounded[2])
          if (
            !Number.isSafeInteger(minimum) ||
            minimum > 128 ||
            (maximum !== undefined &&
              (!Number.isSafeInteger(maximum) ||
                maximum > 128 ||
                maximum < minimum))
          ) {
            return undefined
          }
          const required = '!#' + classToken
          tokens += required.repeat(minimum)
          if (maximum === undefined) {
            tokens +=
              '!' + (minimum === 0 ? classToken : classToken.toUpperCase())
          } else {
            tokens += ('!?' + classToken).repeat(maximum - minimum)
          }
          index += bounded[0].length
          continue
        }
        if (quantifier !== '+' && quantifier !== '*' && quantifier !== '?') {
          return undefined
        }
        const marker =
          quantifier === '+'
            ? classToken.toUpperCase()
            : quantifier === '*'
              ? classToken
              : '?' + classToken
        tokens += '!' + marker
        index++
        continue
      } else if (escaped === 'b' || escaped === 'B') {
        if (/[+*?{]/.test(source[index + 1] ?? '')) {
          return undefined
        }
        tokens += escaped === 'b' ? '!b' : '!B'
        continue
      } else if (escaped === 'x' || escaped === 'u') {
        const width = escaped === 'x' ? 2 : 4
        const digits = source.slice(index + 1, index + width + 1)
        if (digits.length !== width || !/^[\da-f]+$/i.test(digits)) {
          return undefined
        }
        const code = Number.parseInt(digits, 16)
        literal = String.fromCharCode(code)
        index += width
      } else if (escaped === 't') {
        literal = '\t'
      } else if (escaped === 'n') {
        literal = '\n'
      } else if (escaped === 'r') {
        literal = '\r'
      } else if (escaped === 'f') {
        literal = '\f'
      } else if (escaped === 'v') {
        literal = '\v'
      } else if (escaped === '0' && !/\d/.test(source[index + 1] ?? '')) {
        literal = '\0'
      } else if (escapable.includes(escaped)) {
        literal = escaped
      } else {
        return undefined
      }
    } else if (char === '[') {
      let cursor = index + 1
      let negated = source[cursor] === '^'
      if (negated) {
        cursor++
      }
      let mask = BigInt(0)
      let whitespace = false
      let closed = false
      while (cursor < source.length) {
        if (source[cursor] === ']') {
          closed = true
          break
        }
        if (
          source[cursor] === '\\' &&
          /[dwsDWS]/.test(source[cursor + 1] ?? '')
        ) {
          const shorthand = source[cursor + 1]!
          cursor += 2
          if (shorthand === 'D' || shorthand === 'W' || shorthand === 'S') {
            if (mask !== BigInt(0) || whitespace || source[cursor] !== ']') {
              return undefined
            }
            negated = !negated
          }
          if (shorthand.toLowerCase() === 's') {
            whitespace = true
          } else if (shorthand.toLowerCase() === 'd') {
            for (let code = 48; code <= 57; code++) {
              mask |= BigInt(1) << BigInt(code)
            }
          } else {
            for (let code = 48; code <= 57; code++) {
              mask |= BigInt(1) << BigInt(code)
            }
            for (let code = 65; code <= 90; code++) {
              mask |= BigInt(1) << BigInt(code)
            }
            for (let code = 97; code <= 122; code++) {
              mask |= BigInt(1) << BigInt(code)
            }
            mask |= BigInt(1) << BigInt(95)
          }
          continue
        }
        // eslint-disable-next-line complexity -- Decodes one escaped character within the active class scan.
        const readCharacter = (): number | undefined => {
          let value = source[cursor++]
          if (value === '\\') {
            value = source[cursor++]
            if (value === undefined) {
              return undefined
            }
            if (value === 'x' || value === 'u') {
              const width = value === 'x' ? 2 : 4
              const digits = source.slice(cursor, cursor + width)
              if (digits.length !== width || !/^[\da-f]+$/i.test(digits)) {
                return undefined
              }
              cursor += width
              return Number.parseInt(digits, 16)
            }
            if (value === 't') {
              return 0x09
            }
            if (value === 'n') {
              return 0x0a
            }
            if (value === 'r') {
              return 0x0d
            }
            if (value === 'f') {
              return 0x0c
            }
            if (value === 'v') {
              return 0x0b
            }
            if (value === '0' && !/\d/.test(source[cursor] ?? '')) {
              return 0
            }
            if (!escapable.includes(value)) {
              return undefined
            }
          }
          if (value === undefined) {
            return undefined
          }
          const code = value.charCodeAt(0)
          return value.length === 1 ? code : undefined
        }
        const lower = readCharacter()
        if (lower === undefined || lower > 127) {
          return undefined
        }
        if (
          source[cursor] === '-' &&
          source[cursor + 1] !== ']' &&
          lower !== 45
        ) {
          cursor++
          const upper = readCharacter()
          if (upper === undefined || upper > 127 || upper < lower) {
            return undefined
          }
          for (let code = lower; code <= upper; code++) {
            mask |= BigInt(1) << BigInt(code)
          }
        } else {
          mask |= BigInt(1) << BigInt(lower)
        }
        // A leading hyphen is literal; other hyphens can introduce ranges.
      }
      if (!closed) {
        return undefined
      }
      const encodedMask = mask.toString(16).padStart(32, '0')
      const appendClass = (mode: string) => {
        const flags = (negated ? 1 : 0) + (whitespace ? 2 : 0)
        tokens += `!c${mode}${flags}${encodedMask}`
      }
      const quantifier = source[cursor + 1]
      if (quantifier === '{') {
        const bounded = /^\{(\d+)(?:,(\d*))?\}/.exec(source.slice(cursor + 1))
        if (!bounded) {
          return undefined
        }
        const minimum = Number(bounded[1])
        const maximum =
          bounded[2] === undefined
            ? minimum
            : bounded[2] === ''
              ? undefined
              : Number(bounded[2])
        if (
          !Number.isSafeInteger(minimum) ||
          minimum > 128 ||
          (maximum !== undefined &&
            (!Number.isSafeInteger(maximum) ||
              maximum > 128 ||
              maximum < minimum))
        ) {
          return undefined
        }
        for (let count = 0; count < minimum; count++) {
          appendClass('#')
        }
        if (maximum === undefined) {
          appendClass(minimum === 0 ? 'c' : 'C')
        } else {
          for (let count = minimum; count < maximum; count++) {
            appendClass('?')
          }
        }
        index = cursor + bounded[0].length
        continue
      }
      const mode =
        quantifier === '+'
          ? 'C'
          : quantifier === '*'
            ? 'c'
            : quantifier === '?'
              ? '?'
              : '#'
      appendClass(mode)
      index = cursor + (['+', '*', '?'].includes(quantifier ?? '') ? 1 : 0)
      continue
    } else if (char === '.') {
      const quantifier = source[index + 1]
      if (quantifier === '{') {
        const bounded = /^\{(\d+)(?:,(\d*))?\}/.exec(source.slice(index + 1))
        if (!bounded) {
          return undefined
        }
        const minimum = Number(bounded[1])
        const maximum =
          bounded[2] === undefined
            ? minimum
            : bounded[2] === ''
              ? undefined
              : Number(bounded[2])
        if (
          !Number.isSafeInteger(minimum) ||
          minimum > 128 ||
          (maximum !== undefined &&
            (!Number.isSafeInteger(maximum) ||
              maximum > 128 ||
              maximum < minimum))
        ) {
          return undefined
        }
        tokens += '!#a'.repeat(minimum)
        if (maximum === undefined) {
          tokens += '!' + (minimum === 0 ? 'a' : 'A')
        } else {
          tokens += '!?a'.repeat(maximum - minimum)
        }
        index += bounded[0].length
        continue
      }
      tokens +=
        quantifier === '+'
          ? '!A'
          : quantifier === '*'
            ? '!a'
            : quantifier === '?'
              ? '!?a'
              : '!#a'
      if (['+', '*', '?'].includes(quantifier ?? '')) {
        index++
      }
      continue
    } else if (char >= ' ' && char <= '~' && !'.*+?^${}()|[]'.includes(char)) {
      literal = char
    } else if (char > '~') {
      // Regex matching in JavaScript operates on UTF-16 code units here (the
      // resolver regexes have no `u` flag), so preserve each unit explicitly.
      tokens += `!u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
      continue
    } else {
      return undefined
    }
    const code = literal!.charCodeAt(0)
    tokens +=
      code > 0x7f
        ? `!u${code.toString(16).padStart(4, '0')}`
        : code.toString(16).padStart(2, '0')
  }
  return { tokens, anchor }
}
