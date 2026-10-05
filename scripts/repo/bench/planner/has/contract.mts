export const contractVersion = 2
export type Route = 'forward' | 'inverse' | 'empty' | 'ineligible'

export interface RouteFacts {
  eligible: boolean
  anchors: number
  witnesses: number | null
  denseInverse: boolean
  weakMapAvailable: boolean
}

export function referenceRoute(facts: RouteFacts): Route {
  if (!facts.eligible) {
    return 'ineligible'
  }
  if (!Number.isSafeInteger(facts.anchors) || facts.anchors < 0) {
    throw new Error('Invalid anchor count')
  }
  if (facts.anchors < 32) {
    return 'forward'
  }
  const count = facts.witnesses
  if (count === null || !Number.isSafeInteger(count) || count < 0) {
    throw new Error('Missing or invalid witness count')
  }
  if (count === 0) {
    return 'empty'
  }
  if (
    count > facts.anchors * 2 &&
    (!facts.denseInverse || facts.anchors > 192 || count > facts.anchors * 4)
  ) {
    return 'forward'
  }
  return facts.weakMapAvailable ? 'inverse' : 'forward'
}

export function contractVectors() {
  const vectors: Array<{ facts: RouteFacts; route: Route }> = []
  for (const anchors of [0, 1, 31, 32, 33, 191, 192, 193]) {
    const counts = new Set([
      0,
      1,
      Math.max(0, 2 * anchors - 1),
      2 * anchors,
      2 * anchors + 1,
      4 * anchors,
      4 * anchors + 1,
    ])
    for (const witnesses of counts) {
      for (const denseInverse of [false, true]) {
        for (const weakMapAvailable of [false, true]) {
          const facts = {
            eligible: true,
            anchors,
            witnesses,
            denseInverse,
            weakMapAvailable,
          }
          vectors.push({ facts, route: referenceRoute(facts) })
        }
      }
    }
  }
  vectors.push({
    facts: {
      eligible: false,
      anchors: 0,
      witnesses: null,
      denseInverse: false,
      weakMapAvailable: false,
    },
    route: 'ineligible',
  })
  return vectors
}
