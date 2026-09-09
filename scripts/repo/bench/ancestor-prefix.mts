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
