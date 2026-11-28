import { nativeOperatorCode } from './regex.mts'

type ResolverEngine = {
  Selectors: Record<string, { Expression: RegExp }>
  Operators: Record<string, unknown>
  Combinators?: Record<string, (match: RegExpMatchArray) => string>
  CFG: { combinators: string }
}

const nativeJqueryResolver = '__nwsapi$nativeJqueryResolver$__'

function isNativeJqueryResolver(resolver: object): boolean {
  return (resolver as Record<string, unknown>)[nativeJqueryResolver] === true
}

export function hasNativeJqueryResolvers(
  engine: Pick<ResolverEngine, 'Selectors'>,
): boolean {
  const child = engine.Selectors['jquery:child']
  const pseudo = engine.Selectors['jquery:pseudo']
  return (
    !!child &&
    !!pseudo &&
    isNativeJqueryResolver(child) &&
    isNativeJqueryResolver(pseudo)
  )
}

export function hasUnmarkedSelectorResolvers(
  engine: Pick<ResolverEngine, 'Selectors'>,
): boolean {
  return Object.keys(engine.Selectors).some(
    name => !isNativeJqueryResolver(engine.Selectors[name]!),
  )
}

function containsUnquotedText(selector: string, value: string): boolean {
  let quote = ''
  let escaped = false
  for (let index = 0, length = selector.length; index < length; index++) {
    const char = selector[index]!
    if (escaped) {
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (quote) {
      if (char === quote) {
        quote = ''
      }
    } else if (char === '/' && selector[index + 1] === '*') {
      const close = selector.indexOf('*/', index + 2)
      if (close < 0) {
        break
      }
      index = close + 1
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (selector.startsWith(value, index)) {
      return true
    }
  }
  return false
}

function findUnquotedPositions(
  selector: string,
  predicate: (char: string) => boolean,
): number[] {
  const positions: number[] = []
  let quote = ''
  let escaped = false
  let brackets = 0
  for (let index = 0, length = selector.length; index < length; index++) {
    const char = selector[index]!
    if (escaped) {
      escaped = false
    } else if (char === '\\') {
      escaped = true
    } else if (quote) {
      if (char === quote) {
        quote = ''
      }
    } else if (char === '/' && selector[index + 1] === '*') {
      const close = selector.indexOf('*/', index + 2)
      if (close < 0) {
        break
      }
      index = close + 1
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '[') {
      brackets++
    } else if (char === ']') {
      brackets = Math.max(0, brackets - 1)
    } else if (brackets === 0 && predicate(char)) {
      positions.push(index)
    }
  }
  return positions
}

function hasCustomOperator(
  operators: Record<string, unknown>,
  containsUnquoted: (value: string) => boolean,
) {
  const names = Object.keys(operators)
  for (let index = 0, length = names.length; index < length; index++) {
    const operator = names[index]!
    if (
      (operator === '!=' && isNativeNotEqualOperator(operators[operator])) ||
      nativeOperatorCode(operator, operators[operator]) !== undefined
    ) {
      continue
    }
    if (
      !['=', '^=', '$=', '*=', '|=', '~='].includes(operator) &&
      containsUnquoted(operator)
    ) {
      return true
    }
  }
  return false
}

export function isNativeNotEqualOperator(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const operator = value as { p1?: unknown; p2?: unknown; p3?: unknown }
  return operator.p1 === '^' && operator.p2 === '$' && operator.p3 === 'false'
}

// eslint-disable-next-line complexity -- routes distinct JS resolver extension shapes before Rust dispatch.
// A literal empty resolver prefix keeps the current element on both sides.
// Inspect only an own data property. Accessors and executable callback bodies
// must retain the compiler's normal call timing and match-array arguments.
function identityCombinator(
  engine: ResolverEngine,
  selector: string,
): string | undefined {
  if (!engine.Combinators) {
    return undefined
  }
  // v3 match() checks the left tag, while select() also seeds candidates from
  // the right tag. Repeated identical tags agree in both execution modes.
  const symbol = /^([a-zA-Z][a-zA-Z0-9-]*)([!?%@/&^<])\1(?:\2\1)*$/.exec(
    selector,
  )?.[2]
  if (!symbol) {
    return undefined
  }
  const callback = Object.getOwnPropertyDescriptor(
    engine.Combinators,
    symbol,
  )?.value
  if (typeof callback !== 'function') {
    return undefined
  }
  const source = Function.prototype.toString.call(callback)
  return /^\(\s*\)\s*=>\s*(?:''|"")$/.test(source) ? symbol : undefined
}

// eslint-disable-next-line complexity -- Validates one narrowly supported callback shape before translating it.
function nativePseudoRecord(
  selector: string,
  entry: { Expression: RegExp },
): string | undefined {
  const expression = entry.Expression
  if (
    expression.exec !== RegExp.prototype.exec ||
    expression[Symbol.match] !== RegExp.prototype[Symbol.match] ||
    (expression.flags !== '' && expression.flags !== 'i')
  ) {
    return undefined
  }
  // Keep the native shortcut limited to a plain registered pseudo prefix.
  // The pseudo can occur anywhere in a compound or complex selector; requiring
  // the entire selector to be just `tag:pseudo` needlessly routed those cases
  // through the JavaScript compiler even though the Rust predicate is local.
  const pattern = /^\^(:{1,2})([a-zA-Z][a-zA-Z0-9-]*)\(\.\*\)$/.exec(
    expression.source,
  )
  if (!pattern) {
    return undefined
  }
  const separator = pattern[1]!
  const registeredName = pattern[2]!
  const expected = '^' + separator + registeredName + '(.*)'
  if (
    expression.source !== expected &&
    !(
      expression.flags === 'i' &&
      /^[\x00-\x7f]+$/.test(expression.source) &&
      expression.source.toLowerCase() === expected.toLowerCase()
    )
  ) {
    return undefined
  }
  const pseudoPositions = findUnquotedPositions(selector, char => char === ':')
  const matcher = new RegExp(expression.source, expression.flags)
  let name: string | undefined
  for (
    let position = 0, length = pseudoPositions.length;
    position < length;
    position++
  ) {
    const index = pseudoPositions[position]!
    const prefix = selector.slice(index)
    if (!matcher.test(prefix)) {
      continue
    }
    const occurrence = /^:{1,2}([a-zA-Z][a-zA-Z0-9-]*)/.exec(prefix)
    if (occurrence && occurrence[0].startsWith(separator)) {
      name = occurrence[1]
      break
    }
  }
  if (!name) {
    return undefined
  }
  const callback = Object.getOwnPropertyDescriptor(entry, 'Callback')?.value
  if (typeof callback !== 'function') {
    return undefined
  }
  const source = Function.prototype.toString.call(callback)
  // Whitespace around the strict equality operator is insignificant in the
  // generated guard. Accept both common formatter styles before falling back
  // to the host compiler for more complex callback logic.
  const sourceValue = String.raw`source(?:\s*:\s*(\`if\s*\(\s*(?:false|e\.localName\s*===\s*"([^\s"\\:;]+)")\s*\)\s*\{\s*\$\{source\}\s*\}\`))?`
  const record = String.raw`\{\s*(?:match\s*,\s*status\s*:\s*true|status\s*:\s*true\s*,\s*match)\s*,\s*${sourceValue}\s*,?\s*\}`
  const bodyPatterns = [
    new RegExp(
      String.raw`^\(\s*match\s*,\s*source\s*\)\s*=>\s*\(\s*${record}\s*\)$`,
    ),
    new RegExp(
      String.raw`^\(\s*match\s*,\s*source\s*\)\s*=>\s*\{\s*return\s+${record}\s*;?\s*\}$`,
    ),
    new RegExp(
      String.raw`^function(?:\s+[\w$]+)?\s*\(\s*match\s*,\s*source\s*\)\s*\{\s*return\s+${record}\s*;?\s*\}$`,
    ),
  ]
  let body: RegExpExecArray | null = null
  for (
    let index = 0, length = bodyPatterns.length;
    index < length && !body;
    index++
  ) {
    body = bodyPatterns[index]!.exec(source)
  }
  if (!body) {
    return undefined
  }
  if (body[2]) {
    return ':L' + name + ':' + body[2] + ';'
  }
  return (body[1] ? ':F' : ':S') + name + ';'
}

// eslint-disable-next-line complexity -- Combines independent registry checks to preserve resolver routing semantics.
export function selectorUsesCustomResolver(
  engine: ResolverEngine,
  selector: string,
): boolean {
  const unquotedPositions = (predicate: (char: string) => boolean) =>
    findUnquotedPositions(selector, predicate)
  const containsUnquoted = (value: string) => {
    return containsUnquotedText(selector, value)
  }
  const tokenStarts = [0]
  const positions = unquotedPositions(char =>
    /[\t\n\f\r ,>+~!%&/?@:.[#|*(]/.test(char),
  )
  for (
    let positionIndex = 0, positionLength = positions.length;
    positionIndex < positionLength;
    positionIndex++
  ) {
    const index = positions[positionIndex]!
    if (selector[index] === ':') {
      tokenStarts.push(index)
    }
    let next = index + 1
    while (/[\t\n\f\r ]/.test(selector[next] ?? '')) {
      next++
    }
    tokenStarts.push(next)
  }
  // Only the callbacks installed by the bundled plugin have native Rust
  // equivalents. A user callback can use the same registry prefix or name.
  const extensions = Object.keys(engine.Selectors).filter(
    name => !isNativeJqueryResolver(engine.Selectors[name]!),
  )
  const tokenLength = tokenStarts.length
  for (
    let extensionIndex = 0, extensionLength = extensions.length;
    extensionIndex < extensionLength;
    extensionIndex++
  ) {
    const extension = extensions[extensionIndex]!
    const entry = engine.Selectors[extension]!
    if (nativePseudoRecord(selector, entry)) {
      continue
    }
    const expression = entry.Expression
    // String.match dispatches through the plugin's hooks. A cloned RegExp
    // would lose those hooks, and probing the original could run them twice.
    if (
      expression[Symbol.match] !== RegExp.prototype[Symbol.match] ||
      expression.exec !== RegExp.prototype.exec
    ) {
      return true
    }
    // Probe a copy: a sticky plugin expression can start at a nonzero lastIndex.
    // Only the compiler may advance or reset the plugin's original expression.
    const matcher = new RegExp(expression.source, expression.flags)
    for (let tokenIndex = 0; tokenIndex < tokenLength; tokenIndex++) {
      const index = tokenStarts[tokenIndex]!
      const token = selector.slice(index)
      matcher.lastIndex =
        expression.sticky && !expression.global ? expression.lastIndex : 0
      if (matcher.test(token)) {
        return true
      }
    }
  }

  if (hasCustomOperator(engine.Operators, containsUnquoted)) {
    return true
  }

  const registeredCombinators = engine.Combinators ?? {}
  const identity = identityCombinator(engine, selector)
  const symbols = Object.keys(registeredCombinators)
  for (
    let symbolIndex = 0, symbolLength = symbols.length;
    symbolIndex < symbolLength;
    symbolIndex++
  ) {
    const symbol = symbols[symbolIndex]!
    if (
      symbol !== identity &&
      symbol.length === 1 &&
      unquotedPositions(char => char === symbol).length > 0
    ) {
      return true
    }
  }

  const classEnd = engine.CFG.combinators.indexOf(']')
  const classBody = engine.CFG.combinators.slice(
    1,
    classEnd < 0 ? undefined : classEnd,
  )
  for (let index = 0, length = classBody.length; index < length; index++) {
    const char = classBody[index]!
    if (char === '\\') {
      index += classBody[index + 1] === 'x' ? 3 : 1
    } else if (char !== identity && !['>', '+', '~'].includes(char)) {
      if (unquotedPositions(current => current === char).length > 0) {
        return true
      }
    }
  }

  return false
}

export function nativeCustomOperatorForSelector(
  engine: ResolverEngine,
  selector: string,
): string | undefined {
  const names = Object.keys(engine.Operators)
  const identity = identityCombinator(engine, selector)
  let codes = identity ? identity + 'CI' : ''
  if (selector.includes(':')) {
    const selectorNames = Object.keys(engine.Selectors)
    for (
      let index = 0, length = selectorNames.length;
      index < length;
      index++
    ) {
      const key = selectorNames[index]!
      const record = nativePseudoRecord(selector, engine.Selectors[key]!)
      if (record) {
        codes += record
      }
    }
  }
  for (let index = 0, length = names.length; index < length; index++) {
    const operator = names[index]!
    if (
      ['=', '^=', '$=', '*=', '|=', '~='].includes(operator) ||
      (operator === '!=' &&
        isNativeNotEqualOperator(engine.Operators[operator])) ||
      !containsUnquotedText(selector, operator)
    ) {
      continue
    }
    const code = nativeOperatorCode(operator, engine.Operators[operator])
    if (code) {
      codes += code
    }
  }
  return codes || undefined
}

export function selectorUsesNativeNotEqualOperator(
  engine: ResolverEngine,
  selector: string,
): boolean {
  return (
    isNativeNotEqualOperator(engine.Operators['!=']) &&
    containsUnquotedText(selector, '!=')
  )
}
