import { ancestorTokenPattern } from './ancestor/token-pattern.mts'
import { isCompoundSeparator } from './predicate/compound-separator.mts'
import type { EngineState } from './state/engine.d.ts'
import type { IdentifierSyntax } from './types.mts'
export function emit(
  engine: EngineState,
  message: string,
  proto?: TypeErrorConstructor | undefined,
) {
  var err
  ++engine.errors
  if (engine.Config.VERBOSITY) {
    if (proto) {
      err = new proto(message)
    } else {
      err = new engine.global.DOMException(message, 'SyntaxError')
    }
    throw err
  }
  if (engine.Config.LOGERRORS && console && console.log) {
    console.log(message)
  }
}

export function initialize(engine: EngineState, doc: Document) {
  engine.setIdentifierSyntax()
  engine.lastContext = engine.switchContext(doc, true)
}

export function setIdentifierSyntax(engine: EngineState) {
  var syntax = (
    engine.Factory as unknown as {
      _identifierSyntax(
        operators: string,
        combinators: string,
      ): IdentifierSyntax
    }
  )._identifierSyntax(engine.CFG.operators, engine.CFG.combinators)
  engine.reOptimizer = new RegExp(syntax.optimizer)
  engine.reValidator = new RegExp(syntax.validator)
  engine.reSimpleId = new RegExp(syntax.simpleId)
  engine.Patterns.id = new RegExp(syntax.id)
  engine.Patterns.tagName = new RegExp(syntax.tagName)
  engine.Patterns.className = new RegExp(syntax.className)
  engine.Patterns.attribute = new RegExp(syntax.attribute)
}

export function canReuseAncestor(
  engine: EngineState,
  selector: string,
): boolean {
  var scanReusableAncestorsDone = false
  var scanReusableAncestorsValue!: boolean

  // A descendant combinator requires whitespace. Strings and escapes can
  // also contain it, so only absence is enough to skip token inspection.
  if (!/[\t\n\f\r ]/.test(selector)) {
    return false
  }
  for (var extension in engine.Selectors) {
    if (engine.Selectors[extension]) {
      return false
    }
  }
  for (extension in engine.Combinators) {
    if (engine.Combinators[extension]) {
      return false
    }
  }
  var walks = 0,
    token,
    pattern,
    match: RegExpMatchArray | null
  {
    scanReusableAncestors()
    if (scanReusableAncestorsDone) {
      return scanReusableAncestorsValue
    }
  }
  return walks == 1

  function scanReusableAncestors() {
    while (selector) {
      token = selector.charAt(0)
      pattern = ancestorTokenPattern(token)
      if (token == ':') {
        match = selector.match(engine.Patterns['structural']!)
        if (match) {
          if (
            match[1]!.toLowerCase() == 'root' ||
            match[1]!.toLowerCase() == 'scope'
          ) {
            {
              scanReusableAncestorsValue = false
              scanReusableAncestorsDone = true
              return
            }
          }
        } else {
          // Inspect the token without validating it again. Validation can
          // emit errors, while this eligibility pass must remain silent.
          var nth = engine.readPseudo(selector)
          if (
            !nth ||
            !engine.Patterns['treestruct']!.test(selector) ||
            nth.argument === null ||
            nth.argument.toLowerCase().indexOf('of') >= 0
          ) {
            {
              scanReusableAncestorsValue = false
              scanReusableAncestorsDone = true
              return
            }
          }
          selector = nth.rest
          continue
        }
      } else {
        if (pattern == 'ancestor' && ++walks > 1) {
          {
            scanReusableAncestorsValue = false
            scanReusableAncestorsDone = true
            return
          }
        }
        match = selector.match(engine.Patterns[pattern]!)
      }
      if (!match || match[match.length - 1] === selector) {
        {
          scanReusableAncestorsValue = false
          scanReusableAncestorsDone = true
          return
        }
      }
      selector = match[match.length - 1]!
    }
  }
}

export { compile } from './compile.mts'

export function isCompound(
  _engine: EngineState,
  text: string,
  siblings?: boolean,
) {
  var chr: number,
    depth = 0,
    escaped: boolean | undefined,
    i = 0,
    l = text.length,
    quote = 0

  for (; l > i; ++i) {
    chr = text.charCodeAt(i)
    if (escaped) {
      escaped = false
      continue
    }
    if (chr == 92 /* '\\' */) {
      escaped = true
    } else if (quote) {
      if (chr == quote) {
        quote = 0
      }
    } else if (chr == 34 /* '"' */ || chr == 39 /* "'" */) {
      quote = chr
    } else if (chr == 40 /* '(' */ || chr == 91 /* '[' */) {
      ++depth
    } else if (chr == 41 /* ')' */ || chr == 93 /* ']' */) {
      --depth
    } else if (isCompoundSeparator(depth, chr, siblings) /* '\r' */) {
      return false
    }
  }

  return l > 0
}
