import { ancestorTokenPattern } from './token-pattern.mts'
import type { EngineState } from '../state/types.mts'
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
