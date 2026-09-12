import type {
  EngineState,
  EngineContext,
  RelativePlan,
} from '../state/types.mts'

export function hasCandidates(
  engine: EngineState,
  token: string,
  context: EngineContext,
) {
  var kind = token[0]!,
    name = token.slice(1),
    api = kind == '.' ? engine.method['.'] : engine.method['*'],
    nodes,
    snapshot
  if (
    !engine.Config.LEGACY &&
    (kind == '.' ||
      (kind == '*' &&
        (name == '*' ||
          (engine.HTML_DOCUMENT && !engine.hasForeignTypes(context))))) &&
    !/[\t\n\f\r ]/.test(name) &&
    api in context
  ) {
    nodes = context[api]!(name)
    snapshot = engine.collectionSnapshot(
      nodes,
      context,
      undefined,
      undefined,
      kind == '*' && name == '*' ? context : undefined,
    )
    if (snapshot !== nodes) {
      return snapshot
    }
    return engine.collectionCopy(nodes, context, snapshot)
  }
  return engine.fetch[kind]!(name, context)
}

export function has(
  engine: EngineState,
  argument: string | string[],
  anchor: Element,
): boolean {
  var compileRelativePlansDone = false
  var compileRelativePlansValue!: boolean

  var key =
      typeof argument == 'string'
        ? 's:' + argument
        : 'a:' + JSON.stringify(argument),
    plans = (
      engine.hasPlans ||
      (engine.hasPlans = engine.createCache<RelativePlan[]>())
    ).get(key),
    list,
    parsed,
    normalized,
    range,
    result,
    context,
    root,
    candidates,
    resolver,
    token,
    i: number,
    j: number,
    previousErrors = engine.errors,
    previous = engine.Snapshot.anchor
  engine.Snapshot.anchor = anchor
  try {
    {
      compileRelativePlans()
      plans = plans!
      if (compileRelativePlansDone) {
        return compileRelativePlansValue
      }
    }
    for (var plansLength = plans.length, i = 0; i < plansLength; ++i) {
      context = plans[i]!.sibling ? engine.upOf(anchor) : anchor
      if (!context) {
        continue
      }
      root = plans[i]!.subtree ? engine.nextOf(anchor) : context
      while (root) {
        if (!plans[i]!.subtree || engine.firstOf(root)) {
          for (
            var nodesetLength = plans[i]!.nodeset.length, j = 0;
            j < nodesetLength;
            ++j
          ) {
            token = plans[i]!.nodeset[j]!
            resolver = plans[i]!.factory[j]
            candidates = engine.hasCandidates(token, root)
            // Keep the original scope while narrowing only the lookup root.
            if (
              resolver
                ? resolver(candidates, null, context, []).length
                : candidates.length
            ) {
              return true
            }
          }
        }
        root = plans[i]!.subtree == 126 ? engine.nextOf(root as Element) : null
      }
    }
    return false
  } finally {
    engine.Snapshot.anchor = previous
  }

  function compileRelativePlans() {
    if (!plans) {
      list = typeof argument == 'string' ? engine.splitList(argument) : argument
      plans = []
      // Compile every branch before accepting any match. Plans contain
      // code and lookup tokens, never anchors or DOM result collections.
      for (var listLength = list.length, i = 0; i < listLength; ++i) {
        if (!list[i]) {
          engine.emit(engine.qsInvalid)
          {
            compileRelativePlansValue = false
            compileRelativePlansDone = true
            return
          }
        }
        parsed = engine.parse('* ' + list[i], true)
        if (!parsed || !parsed.length) {
          {
            compileRelativePlansValue = false
            compileRelativePlansDone = true
            return
          }
        }
        normalized = parsed.map(function (selector: string) {
          return selector.slice(1).replace(/^\s+/, '')
        })
        // A simple sibling type followed by descendants cannot leave that
        // sibling subtree without another sibling or custom combinator.
        range = normalized[0]!.match(
          /^[+~][\t\n\f\r ]*(?:[a-zA-Z][\w-]*|\*)(?:[\t\n\f\r ]+|>)([\s\S]+)$/,
        )
        result = engine.collect(normalized, anchor, undefined, true, true, true)
        plans.push({
          sibling: /^[+~]/.test(list[i]!),
          subtree:
            !engine.Config.LEGACY &&
            normalized.length == 1 &&
            range &&
            !/[+~]/.test(range[1]!) &&
            Object.keys(engine.Combinators).length == 0
              ? normalized[0]!.charCodeAt(0)
              : 0,
          factory: result.factory,
          nodeset: result.nodeset,
        })
      }
      if (engine.errors != previousErrors) {
        {
          compileRelativePlansValue = false
          compileRelativePlansDone = true
          return
        }
      }
      engine.hasPlans!.set(key, plans)
    }
  }
}

export function firstMatch(_engine: EngineState) {
  return false
}
