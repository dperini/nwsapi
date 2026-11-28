import type {
  AttributeOperator,
  EngineState,
  SelectorExtension,
} from '../state/types.mts'

function firstNonEqualsSymbol(token: string): string | undefined {
  for (let i = 0, l = token.length; i < l; ++i) {
    if (token[i] != '=') {
      return token[i]
    }
  }
  return undefined
}

export function registerCombinator(
  engine: EngineState,
  combinator: string,
  resolver: (match: RegExpMatchArray) => string,
) {
  const symbol = firstNonEqualsSymbol(combinator)
  // CFG.combinators is a regular expression, so `indexOf` also finds
  // symbols inside syntax such as the `!` in a negated character class.
  // Check the registered resolver table and actual built-in combinators.
  if (
    symbol &&
    ![' ', '\t', '>', '+', '~'].includes(symbol) &&
    !engine.Combinators[combinator] &&
    !engine.Combinators[symbol]
  ) {
    engine.CFG.combinators = engine.CFG.combinators
      .replace('](', symbol + '](')
      .replace('])', symbol + '])')
    engine.registeredSyntax.combinators = engine.registeredSyntax.combinators
      .replace('](', symbol + '](')
      .replace('])', symbol + '])')
    engine.Combinators[combinator] = resolver
    engine.hasExtensions = true
    engine.customResolvers = true
    engine.setIdentifierSyntax()
    engine.selectorGeneration++
    engine.configure({}, true)
  } else {
    console.warn(
      "Warning: the '" + combinator + "' combinator is already registered.",
    )
  }
}

export function registerOperator(
  engine: EngineState,
  operator: string,
  resolver: AttributeOperator,
) {
  const symbol = firstNonEqualsSymbol(operator)
  if (
    engine.CFG.operators.indexOf(symbol!) < 0 &&
    !engine.Operators[operator]
  ) {
    engine.CFG.operators = engine.CFG.operators.replace(']=', symbol + ']=')
    engine.registeredSyntax.operators =
      engine.registeredSyntax.operators.replace(']=', symbol + ']=')
    engine.Operators[operator] = resolver
    engine.customResolvers = true
    engine.setIdentifierSyntax()
    engine.selectorGeneration++
    engine.configure({}, true)
  } else {
    console.warn(
      "Warning: the '" + operator + "' operator is already registered.",
    )
  }
}

export function registerSelector(
  engine: EngineState,
  name: string | number,
  rexp: RegExp,
  func: SelectorExtension['Callback'],
) {
  if (!engine.Selectors[name]) {
    engine.Selectors[name] = {
      Expression: rexp,
      Callback: func,
    }
    engine.hasExtensions = true
    if (name !== 'jquery:child' && name !== 'jquery:pseudo') {
      engine.customResolvers = true
    }
    engine.selectorGeneration++
    engine.configure({}, true)
  }
}
