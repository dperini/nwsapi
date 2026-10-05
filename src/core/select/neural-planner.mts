import type { BulkHasPlanner } from '../state/types.mts'

// Frozen policies come from planner-dispatch-crossed-model-2026-10-05-r1.
// Chromium is the default policy. The measured applicability guards remain.
export type NeuralPlannerHost = 'chromium' | 'jsdom'

export function neuralPlannerPolicy(host: NeuralPlannerHost): BulkHasPlanner {
  if (host === 'chromium') {
    return chromiumPolicy
  }
  if (host === 'jsdom') {
    return jsdomPolicy
  }
  throw new TypeError('Select the chromium or jsdom experimental policy')
}

function chromiumPolicy(
  anchors: number,
  witnesses: number,
  attributes: number,
  dense: number,
  ratio: number,
) {
  if (!supportedInputs(anchors, witnesses, attributes, dense, ratio)) {
    return false
  }
  var h0 = Math.max(
    0,
    4.17953744832907 +
      0.006445970393207164 * anchors +
      -0.001237694714117135 * witnesses +
      -1.6934969987790789 * (attributes >> 1) +
      1.9987740403888223 * (attributes & 1) +
      -0.28316059708595276 * dense +
      -1.2101973692576091 * ratio,
  )
  var h1 = Math.max(
    0,
    2.597287748725064 +
      0.009217632292722143 * anchors +
      0.0025723836936285944 * witnesses +
      -0.888835499375548 * (attributes >> 1) +
      -1.3368763712854246 * (attributes & 1) +
      0.05107470974326134 * dense +
      -0.6854634284973145 * ratio,
  )
  var h2 = Math.max(
    0,
    1.9602088835128941 +
      0.0016921339906772743 * anchors +
      -0.0011679149315742931 * witnesses +
      2.0679337313410158 * (attributes >> 1) +
      -2.0143598606744537 * (attributes & 1) +
      0.052165184170007706 * dense +
      -0.38973840077718097 * ratio,
  )
  var h3 = Math.max(
    0,
    8.011757617079402 +
      -0.012647065327815697 * anchors +
      -0.0055700006392621825 * witnesses +
      -2.1309548602481425 * (attributes >> 1) +
      0.0638230346032306 * (attributes & 1) +
      0.17864754796028137 * dense +
      -0.8110613028208414 * ratio,
  )
  var value =
    1.018654465675354 +
    0.8310559988021851 * h0 +
    0.8028913736343384 * h1 +
    0.6000171303749084 * h2 +
    0.945857048034668 * h3
  return finiteScore(value) && value > 3.00001
}

function jsdomPolicy(
  anchors: number,
  witnesses: number,
  attributes: number,
  dense: number,
  ratio: number,
) {
  if (!supportedInputs(anchors, witnesses, attributes, dense, ratio)) {
    return false
  }
  var h0 =
    2.2545929735779073 +
    0.0063056536826381305 * anchors +
    -7.610142811483255e-5 * witnesses +
    -0.9932116883067986 * (attributes >> 1) +
    -0.6860170118907837 * (attributes & 1) +
    0.1816803365945816 * dense +
    -0.19068167554763876 * ratio
  var value = h0
  return finiteScore(value) && value > 1e-5
}

function supportedInputs(
  anchors: number,
  witnesses: number,
  attributes: number,
  dense: number,
  ratio: number,
): boolean {
  return (
    supportedCategory(attributes, dense) &&
    witnesses > anchors * 2 &&
    (!dense || anchors > 192 || witnesses > anchors * 4) &&
    within(anchors, 32, 192) &&
    within(witnesses, 80, 768) &&
    within(ratio, 2.5, 4)
  )
}

function supportedCategory(attributes: number, dense: number): boolean {
  return (
    (attributes === 1 || attributes === 2 || attributes === 3) && dense === 0
  )
}

function within(value: number, minimum: number, maximum: number): boolean {
  return value >= minimum && value <= maximum
}

function finiteScore(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity
}
