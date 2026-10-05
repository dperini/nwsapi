export function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {
  if (!((attributes === 0 && dense === 1) || (attributes === 1 && dense === 0) || (attributes === 2 && dense === 0) || (attributes === 3 && dense === 0))) { return false; }
  if (!(witnesses > anchors * 2 && (!dense || anchors > 192 || witnesses > anchors * 4))) { return false; }
  if (anchors < 32.0 || anchors > 192.0 || !Number.isFinite(anchors) || witnesses < 80.0 || witnesses > 768.0 || !Number.isFinite(witnesses) || attributes < 0.0 || attributes > 3.0 || !Number.isFinite(attributes) || dense < 0.0 || dense > 1.0 || !Number.isFinite(dense) || ratio < 2.5 || ratio > 4.0 || !Number.isFinite(ratio)) { return false; }
  var h0 = 2.2545929735779073 + (0.0063056536826381305) * anchors + (-7.610142811483255e-05) * witnesses + (-0.9932116883067986) * (attributes >> 1) + (-0.6860170118907837) * (attributes & 1) + (0.1816803365945816) * dense + (-0.19068167554763876) * ratio;
  var value = h0;
  return Number.isFinite(value) && value > 1e-05;
}
