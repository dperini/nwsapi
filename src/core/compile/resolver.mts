import { compileCacheKey } from './cache-key.mts'
import { bindResolver } from './factory.mts'
import { parsePure } from './pure.mts'
import type {
  EngineState,
  CompiledResolver,
  CompilerAncestry,
  CompilerContext,
  ElementCallback,
} from '../state/types.mts'

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

  var mask = 0,
    filter,
    filtered,
    ancestry: CompilerAncestry,
    compiler: CompilerContext,
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
  compiler = { nextIdentifier: 0, classes: [] }
  prepareAncestry()

  collectSharedAttributes(selector, compiler)

  source = engine.compileSelector(
    relative && !/^[>+~]/.test(selector) ? ' ' + selector : selector,
    relative ? 'if(e===s.anchor){' + macro + '}' : macro,
    mode,
    callback,
    ancestry,
    compiler,
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

  factory = bindResolver(
    engine,
    '"use strict";' +
      (compiler.prelude || []).join('') +
      engine.F_INIT +
      '{' +
      head +
      vars +
      ';' +
      loop +
      'return r;}',
    filter,
  )

  annotateResolver(factory, filtered, ancestry.position)

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

  function collectSharedAttributes(selector: string, context: CompilerContext) {
    if (engine.Config.LEGACY || callback) {
      return
    }
    const parsed = parsePure(selector)
    if (!parsed) {
      return
    }
    for (
      let compoundIndex = 0, compoundCount = parsed.compounds.length;
      compoundIndex < compoundCount;
      ++compoundIndex
    ) {
      const compound = parsed.compounds[compoundIndex]!
      const counts: Record<string, number> =
        engine.primordials.ObjectCreate(null)
      const seen: Record<string, boolean> =
        engine.primordials.ObjectCreate(null)
      const attributes = attributeSelectors(compound)
      for (let i = 0, length = attributes.length; i < length; ++i) {
        const token = attributes[i]!
        const name = /^\[[\t\n\f\r ]*([_a-zA-Z][\w-]*)/.exec(token)?.[1]
        if (name && !seen[token]) {
          seen[token] = true
          counts[name] = (counts[name] || 0) + 1
        }
      }
      for (const name in counts) {
        if (counts[name]! > 1) {
          context.sharedAttributes ||= engine.primordials.ObjectCreate(null)
          context.sharedAttributes![name] = ''
        }
      }
    }
  }
  function prepareAncestry() {
    // Cache hits need no parser state or helper-alias bookkeeping.
    if ((mode || mode === null) && !engine.Config.LEGACY) {
      ancestry.classes = compiler.classes
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
      for (
        var requiredLength = ancestry.required.length, i = 0;
        i < requiredLength;
        ++i
      ) {
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
    if (compiler.variables) {
      vars += ',' + compiler.variables.join(',')
    }
    if (ancestry.reuse) {
      vars += ',_pStart=null,_pResult=false'
    }
    if (compiler.classes.length) {
      for (
        var classesLength = compiler.classes.length, i = 0;
        i < classesLength;
        ++i
      ) {
        vars += ',_c' + i + '=' + compiler.classes[i]
      }
    }
    if (engine.Config.LEGACY) {
      var rewritten = engine.legacyHooks!.compile(loop)
      loop = rewritten.source
      vars += rewritten.variables
    }
  }
}

function attributeSelectors(compound: string) {
  const attributes: string[] = []
  const length = compound.length
  for (let i = 0; i < length; ++i) {
    if (compound[i] !== '[') {
      continue
    }
    const start = i
    let quote = ''
    let escaped = false
    for (++i; i < length; ++i) {
      const character = compound[i]!
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (quote) {
        if (character === quote) {
          quote = ''
        }
      } else if (character === '"' || character === "'") {
        quote = character
      } else if (character === ']') {
        attributes[attributes.length] = compound.slice(start, i + 1)
        break
      }
    }
  }
  return attributes
}

function annotateResolver(
  resolver: CompiledResolver,
  filtered: boolean | undefined,
  position: boolean | undefined,
) {
  if (filtered) {
    resolver.filtered = true
  }
  if (position) {
    resolver.position = true
  }
}
