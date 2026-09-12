import type { EngineState } from '../state/engine.d.ts'
import type {
  CompiledResolver,
  ElementCallback,
  EngineContext,
} from '../state/types.mts'
export function collect(
  engine: EngineState,
  selectors: string[],
  context: EngineContext,
  callback: ElementCallback,
  relative?: boolean | undefined,
  firstOnly?: boolean | undefined,
  existenceOnly?: boolean | undefined,
) {
  var i: number,
    l: number,
    seen: Record<string, boolean> = {},
    token: string[] = ['', '*', '*'],
    optimized = selectors,
    factory = Array<CompiledResolver | null>(selectors.length),
    candidates: ArrayLike<Element>,
    nodeset = Array<string>(selectors.length),
    results: Element[] = [],
    type

  for (i = 0, l = selectors.length; l > i; ++i) {
    if (!seen[selectors[i]!] && (seen[selectors[i]!] = true)) {
      optimizeCandidateToken()
      // Class lookup narrows candidates; the attribute resolver still
      // checks case and values, including in quirks mode.
      {
        routeAttributeSelector()
      }
    }

    // unescape before recording the token: 'nodeset' is what a later
    // run rebuilds its candidate list from, so the two must agree
    token[2] = engine.unescapeIdentifier(token[2]!)
    nodeset[i] = token[1]! + token[2]!
    factory[i] = engine.compile(
      optimized[i]!,
      existenceOnly || !firstOnly,
      null,
      relative,
      existenceOnly,
    )

    if (firstOnly) {
      continue
    }

    candidates = engine.fetch[token[1]!]!(token[2]!, context)
    if (factory[i]!) {
      factory[i]!(candidates, callback, context, results)
    } else {
      engine.concatList(results, candidates)
    }
  }

  if (l > 1) {
    results.sort(engine.documentOrder)
    engine.hasDupes && (results = engine.unique(results))
  }

  return {
    factory: factory,
    nodeset: nodeset,
    results: results,
  }

  function optimizeCandidateToken() {
    type = selectors[i]!.match(engine.reOptimizer)
    // Escaped delimiters can resemble a terminal tag inside an attribute.
    // Compile escaped selectors intact instead of narrowing that token.
    if (
      type &&
      type[1] != ':' &&
      selectors[i]!.indexOf('\\') < 0 &&
      (token = type)
    ) {
      token[1]! || (token[1] = '*')
      optimized[i] = engine.optimize(optimized[i]!, token as RegExpMatchArray)
    } else {
      token = ['', '*', '*']
      // A terminal union of types can fetch its alternatives instead
      // of every element. Keep the complete predicate in the resolver,
      // including any compound or ancestor constraints around the list.
      type =
        /:(?:is|where)\(([a-z][a-z0-9-]*(?:[\t\n\f\r ]*,[\t\n\f\r ]*[a-z][a-z0-9-]*)+)\)$/.exec(
          selectors[i]!,
        )
      if (
        !firstOnly &&
        type &&
        /^[.#*\w\t\n\f\r >+~-]*$/.test(selectors[i]!.slice(0, type.index))
      ) {
        token = ['', '?', type[1]!]
      }
    }
  }

  function routeAttributeSelector() {
    if (
      engine.HTML_DOCUMENT &&
      !engine.Config.LEGACY &&
      (type = selectors[i]!.match(engine.Patterns['attribute']!)) &&
      type[0] == selectors[i]! &&
      type[1] == 'class' &&
      type[2] == '~=' &&
      type[4] &&
      type[5] != 'i' &&
      !/[\t\n\f\r ]/.test(engine.unescapeIdentifier(type[4])) &&
      engine.Operators['~=']!.p1 == '(^|[\\t\\n\\f\\r ])' &&
      engine.Operators['~=']!.p2 == '([\\t\\n\\f\\r ]|$)' &&
      engine.Operators['~=']!.p3 == 'true'
    ) {
      token = ['', '.', type[4]]
    }
  }
}
