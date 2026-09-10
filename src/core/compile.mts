import { compileCacheKey } from './compile-cache-key.mts'
import type { EngineState } from './state.d.ts'
import type {
  CompiledResolver,
  CompilerAncestry,
  ElementCallback,
} from './types.mts'
export function compile(
  engine: EngineState,
  selector: string,
  mode: boolean | null,
  callback: boolean | ElementCallback,
  relative?: boolean,
  existenceOnly?: boolean,
): CompiledResolver | null {
  var prepareCompileModeDone = false
  var prepareCompileModeValue!: CompiledResolver | null

  var cacheKey = compileCacheKey(
    engine,
    selector,
    mode,
    callback,
    relative,
    existenceOnly,
  )

  var i: number,
    mask,
    filter,
    filtered,
    ancestry: CompilerAncestry,
    factory,
    head = '',
    loop = '',
    macro = '',
    source = '',
    vars = ''
  // 'mode' can be boolean or null
  // true = select / false = match
  // null to use collection.item()
  {
    prepareCompileMode()
    if (prepareCompileModeDone) {
      return prepareCompileModeValue
    }
  }

  ancestry = { required: [], pending: [], walk: false }
  prepareAncestry()

  source = engine.compileSelector(
    relative && !/^[>+~]/.test(selector) ? ' ' + selector : selector,
    relative ? 'if(e===s.anchor){' + macro + '}' : macro,
    mode,
    callback,
    ancestry,
  )

  if ((mode || mode === null) && !callback && source === macro) {
    engine.selectLambdas.set(cacheKey, null)
    return null
  }

  guardAncestors()

  loop += mode || mode === null ? '{' + source + '}' : source

  // Drop the summaries with the call that built them. They key on
  // elements, so holding them past the call would keep a removed subtree
  // alive, and an element that moves in the meantime would carry a
  // summary describing where it used to be.
  if (mask) {
    loop = 'try{' + loop + '}finally{s.clearAncestorMasks();}'
  }

  clearSiblingPositions()

  collectVariables()

  finalizeVariables()

  // oxlint-disable-next-line typescript/no-implied-eval -- Selectors compile to resolver functions.
  factory = Function(
    's',
    'a',
    engine.F_INIT + '{' + head + vars + ';' + loop + 'return r;}',
  )(engine.Snapshot, filter)

  if (filtered) {
    factory.filtered = true
  }

  if (mode || mode === null) {
    engine.selectLambdas.set(cacheKey, factory)
  } else {
    engine.matchLambdas.set(cacheKey, factory)
  }

  return factory

  function prepareCompileMode() {
    switch (mode) {
      case true:
        if ((factory = engine.selectLambdas.get(cacheKey)) !== undefined) {
          {
            prepareCompileModeValue = factory
            prepareCompileModeDone = true
            return
          }
        }
        macro =
          engine.S_BODY +
          (existenceOnly
            ? 'break main;'
            : (callback ? engine.S_TEST : '') + engine.S_TAIL)
        head = engine.S_HEAD
        loop = engine.S_LOOP
        break
      case false:
        if ((factory = engine.matchLambdas.get(cacheKey)) !== undefined) {
          {
            prepareCompileModeValue = factory
            prepareCompileModeDone = true
            return
          }
        }
        macro = engine.M_BODY + (callback ? engine.M_TEST : '') + engine.M_TAIL
        head = engine.M_HEAD
        loop = engine.M_LOOP
        break
      case null:
        if ((factory = engine.selectLambdas.get(cacheKey)) !== undefined) {
          {
            prepareCompileModeValue = factory
            prepareCompileModeDone = true
            return
          }
        }
        macro = engine.N_BODY + (callback ? engine.N_TEST : '') + engine.N_TAIL
        head = engine.N_HEAD
        loop = engine.N_LOOP
        break
      default:
        break
    }
  }
  function prepareAncestry() {
    // Cache hits need no parser state or helper-alias bookkeeping.
    if ((mode || mode === null) && !engine.Config.LEGACY) {
      ancestry.classes = []
    }
    if (
      (mode || mode === null) &&
      !callback &&
      !relative &&
      !engine.Config.LEGACY
    ) {
      ancestry.reuse = macro
    }
  }

  function guardAncestors() {
    // Guard the candidate loop with the ancestor filter. Only for a
    // selection: matching one element has no candidates to reject, and the
    // walk the filter pays for would be the walk it saves. Only when the
    // selector walks ancestors: a chain of child combinators takes one step
    // per combinator whatever the depth, so there is nothing to save and
    // the lookup is a loss. Two required tags or more, so the cheap shapes
    // do not pay a Map lookup to learn what a single comparison tells them.
    // Callbacks can move nodes before later candidates are visited, so they
    // use the full matcher without summaries that could become stale.
    if (
      (mode || mode === null) &&
      ancestry.walk &&
      ancestry.required.length > 1 &&
      !callback &&
      !engine.Config.LEGACY
    ) {
      for (i = 0, mask = 0; ancestry.required.length > i; ++i) {
        mask |= engine.tagBit(ancestry.required[i]!)
      }
      filter = { seen: 0, kept: 0, rest: 0 }
      source = 'if(s.mayMatch(e,' + mask + ',a)){' + source + '}'
    }
  }

  function clearSiblingPositions() {
    var clearPositions =
      (engine.reNthElem.test(selector) ? 's.nthElement(null, 2);' : '') +
      (engine.reNthType.test(selector) ? 's.nthOfType(null, 2);' : '')
    if (clearPositions) {
      loop = 'try{' + loop + '}finally{' + clearPositions + '}'
    }
  }

  function collectVariables() {
    if (engine.S_VARS[0] || engine.M_VARS[0] || engine.N_VARS[0]) {
      filtered = engine.S_VARS.some(function (name) {
        return name.slice(0, 2) == '_f'
      })
      vars =
        ',' +
        (engine.S_VARS.join(',') || engine.M_VARS.join(',') || engine.N_VARS[0])
      engine.S_VARS.length = 0
      engine.M_VARS.length = 0
      engine.N_VARS.length = 0
    }
  }

  function finalizeVariables() {
    if (ancestry.reuse) {
      vars += ',_pStart=null,_pResult=false'
    }
    if (ancestry.classes) {
      for (i = 0; i < ancestry.classes.length; ++i) {
        vars += ',_c' + i + '=' + ancestry.classes[i]
      }
    }
    if (engine.Config.LEGACY) {
      var rewritten = engine.legacyHooks!.compile(loop)
      loop = rewritten.source
      vars += rewritten.variables
    }
  }
}
