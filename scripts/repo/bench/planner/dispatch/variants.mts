import { routeBundle } from '../has/instrument.mts'

export type Override = (
  a: number,
  w: number,
  attributes: number,
  dense: number,
  ratio: number,
) => boolean

export function dispatchBundle(
  source: string,
  model: string,
  instrument = false,
  forwardOnly = false,
  memoize = false,
) {
  if (memoize && !forwardOnly) {
    throw new Error('Decision caching requires a forward-only policy.')
  }
  const preparation = 'anchor: anchor,'
  if (source.split(preparation).length !== 2) {
    throw new Error('Expected one bulk plan preparation.')
  }
  const annotated = source.replace(
    preparation,
    'attributeMask: (parts[1].indexOf("[") < 0 ? 0 : 2) + (parts[2].indexOf("[") < 0 ? 0 : 1), anchor: anchor,',
  )
  const fallback =
    'witnesses.length > anchors.length * 2 && (!plan.denseInverse || anchors.length > 192 || witnesses.length > anchors.length * 4)'
  const override = memoize
    ? 'dispatchCached(anchors.length, witnesses.length, plan.attributeMask, +plan.denseInverse)'
    : 'dispatchOverride(anchors.length, witnesses.length, plan.attributeMask, +plan.denseInverse, witnesses.length / anchors.length)'
  // The certificate permits changes only where the existing route is forward.
  // Short-circuit before reading model inputs or calling another function.
  const decision = forwardOnly
    ? `(${fallback}) && !${override}`
    : `dispatchForward(anchors.length, witnesses.length, plan.attributeMask, +plan.denseInverse)`
  const helpers =
    model.replace(/^export /, '') +
    (memoize ? cachedHelper(instrument) : '') +
    (forwardOnly
      ? ''
      : `
function dispatchForward(anchors, witnesses, attributes, dense) {
  var fallback = witnesses > anchors * 2 && (!dense || anchors > 192 || witnesses > anchors * 4);
  return dispatchOverride(anchors, witnesses, attributes, dense, witnesses / anchors) ? !fallback : fallback;
}
`)
  return (
    routeBundle(annotated, 'baseline', instrument, decision) + '\n' + helpers
  )
}

function cachedHelper(instrument: boolean) {
  const hit = instrument
    ? 'plannerTrace.cacheHits = (plannerTrace.cacheHits || 0) + 1;'
    : ''
  const miss = instrument
    ? 'plannerTrace.inferences = (plannerTrace.inferences || 0) + 1;'
    : ''
  // Counts and flags are the complete inputs. The ratio is derived on a miss.
  // One cached answer holds no references to elements or documents.
  return `
var dispatchAnchors = -1, dispatchWitnesses = -1, dispatchAttributes = -1,
  dispatchDense = -1, dispatchAnswer = false;
function dispatchCached(anchors, witnesses, attributes, dense) {
  if (anchors === dispatchAnchors && witnesses === dispatchWitnesses &&
      attributes === dispatchAttributes && dense === dispatchDense) {
    ${hit}
    return dispatchAnswer;
  }
  ${miss}
  var answer = dispatchOverride(anchors, witnesses, attributes, dense, witnesses / anchors);
  dispatchAnchors = anchors;
  dispatchWitnesses = witnesses;
  dispatchAttributes = attributes;
  dispatchDense = dense;
  dispatchAnswer = answer;
  return answer;
}
`
}
