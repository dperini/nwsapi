// Fixed-selector experiment. The suffix establishes the candidate's parent,
// and the prefix matches any ancestor above that parent. No callback support.
export function createPrefixVariants(
  prefix: (element: Element) => boolean,
  suffix: (element: Element) => boolean,
) {
  return [false, true].map(
    cached =>
      (
        candidates: Element[],
        _callback: null,
        _context: Document,
        results: Element[],
      ) => {
        const cache = cached ? new WeakMap<Element, boolean>() : null
        const trail: Element[] = []
        for (let i = 0; i < candidates.length; ++i) {
          const candidate = candidates[i]!
          if (!suffix(candidate)) {
            continue
          }
          let node = candidate.parentElement!.parentElement
          let matched = false
          while (node) {
            const known = cache?.get(node)
            if (known !== undefined) {
              matched = known
              break
            }
            if (cache) {
              trail.push(node)
            }
            if (prefix(node)) {
              matched = true
              break
            }
            node = node.parentElement
          }
          if (cache) {
            for (let j = 0; j < trail.length; ++j) {
              cache.set(trail[j]!, matched)
            }
            trail.length = 0
          }
          if (matched) {
            results.push(candidate)
          }
        }
        return results
      },
  )
}

// Preserve the fixed collection resolver's positional reads, but let the outer
// query own cleanup. These exact compiler markers are checked before rewriting.
export function createSharedPrefixVariants(
  source: string,
  snapshot: object,
  suffix: (element: Element) => boolean,
  cleanup: () => void,
  inlineSource?: string,
) {
  const loop = 'main:while(++k<l&&(e=c[k])!==undefined){'
  const acceptance = 'r[++j]=c[k];continue main;'
  const ending = source.includes('finally{')
    ? '}finally{s.nthOfType(null, 2);}return r;}'
    : 'return r;}'
  if (
    !source.includes(loop) ||
    !source.includes(acceptance) ||
    !source.endsWith(ending)
  ) {
    throw new Error('Unexpected fixed prefix resolver shape')
  }
  const body = source
    .slice(source.indexOf(loop) + loop.length, -ending.length - 1)
    .replace(acceptance, 'return true;')
  // oxlint-disable-next-line typescript/no-implied-eval -- Fixed benchmark prefix from the collection compiler, with checked wrapper markers.
  const prefix = Function(
    's',
    'return function(e){var n,o,f=null;' + body + 'return false;}',
  )(snapshot) as (element: Element) => boolean
  const variants = [false, true].map(
    cached =>
      (
        candidates: Element[],
        _callback: null,
        _context: Document,
        results: Element[],
      ) => {
        let lastStart: Element | null = null
        let lastResult = false
        try {
          for (let i = 0; i < candidates.length; ++i) {
            const candidate = candidates[i]!
            if (!suffix(candidate)) {
              continue
            }
            const start = candidate.parentElement!.parentElement
            let matched = false
            if (cached && start === lastStart) {
              matched = lastResult
            } else {
              let node = start
              while (node) {
                if (prefix(node)) {
                  matched = true
                  break
                }
                node = node.parentElement
              }
              lastStart = start
              lastResult = matched
            }
            if (matched) {
              results.push(candidate)
            }
          }
          return results
        } finally {
          cleanup()
        }
      },
  )
  if (inlineSource) {
    const walk = 'while(e&&(e=e.parentElement)){'
    const start = inlineSource.indexOf(walk)
    const declaration = inlineSource.lastIndexOf('var ', start)
    const saved = inlineSource.slice(declaration + 4, start - 3)
    const restore = '}e=' + saved + ';'
    if (
      start < 0 ||
      inlineSource.split(walk).length !== 2 ||
      inlineSource.slice(declaration, start) !== 'var ' + saved + '=e;' ||
      !inlineSource.includes(restore) ||
      !inlineSource.includes('var e,')
    ) {
      throw new Error('Unexpected fixed ancestor loop')
    }
    const rewritten = inlineSource
      .replace('var e,', 'var _lastStart=null,_lastResult=false,e,')
      .replace(acceptance, '_lastResult=true;' + acceptance)
      .replace(
        walk,
        'if((e=e.parentElement)===_lastStart){if(_lastResult){' +
          acceptance +
          '}}else{_lastStart=e;_lastResult=false;while(e){',
      )
      .replace(restore, 'e=e.parentElement;}}e=' + saved + ';')
    // oxlint-disable-next-line typescript/no-implied-eval -- Checked fixed compiler loop, preserving the original query and cleanup wrappers.
    variants[1] = Function('s', 'return ' + rewritten)(snapshot)
  }
  return variants
}
