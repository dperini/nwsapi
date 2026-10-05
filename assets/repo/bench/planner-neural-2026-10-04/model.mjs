// Generated from train.py. Research artifact; not used by nwsapi runtime.
const MEAN = [4.42778697001435, 3.2866873888150776, 0.48, 0.6429266214559867, 0.5, 0.5]
const SCALE = [0.920248581213983, 2.3675609148892773, 0.49959983987187156, 0.6509618753434508, 0.5, 0.5]
const W1 = [[0.13155204057693481, 0.0501590371131897, 0.16754910349845886, 0.11985920369625092, 0.11094305664300919, 0.14840905368328094], [0.14966550469398499, -0.5879466533660889, 0.035390883684158325, -0.4354833960533142, 0.28479352593421936, -0.4399518370628357]]
const B1 = [0.4084305167198181, -0.10301009565591812]
const W2 = [[0.5257123708724976, -0.42843765020370483], [0.08211066573858261, -0.3520970046520233]]
const B2 = [0.21656163036823273, 0.24426937103271484]

export function predictLogCosts(features, host) {
  const [anchors, witnesses, attributes, ratio] = features
    const raw = [Math.log1p(anchors), Math.log1p(witnesses), attributes ? 1 : 0,
    Math.log1p(ratio), host === 'chromium' ? 1 : 0, host === 'jsdom' ? 1 : 0]
  const input = raw.map((value, index) => (value - MEAN[index]) / SCALE[index])
  const hidden = W1.map((weights, index) => Math.tanh(
    weights.reduce((sum, weight, column) => sum + weight * input[column], B1[index])))
  return W2.map((weights, index) =>
    weights.reduce((sum, weight, column) => sum + weight * hidden[column], B2[index]))
}

export function chooseInverse(features, host) {
  const [anchors, witnesses, attributes, ratio] = features
  const inDomain = (host === 'chromium' || host === 'jsdom') &&
    [anchors, witnesses, attributes, ratio].every(Number.isFinite) &&
    (attributes === 0 || attributes === 3) &&
    anchors >= 32 && anchors <= 745 &&
    witnesses >= 0 && witnesses <= 2370 &&
    ratio >= 0 && ratio <= 4.319148936170213
  if (!inDomain) return witnesses <= anchors * 2
  const costs = predictLogCosts(features, host)
  const fallback = witnesses <= anchors * 2
  return Math.abs(costs[1] - costs[0]) >= 0.1 &&
    (costs[1] < costs[0]) !== fallback ? costs[1] < costs[0] : fallback
}
