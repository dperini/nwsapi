export function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {
  if (!((attributes === 0 && dense === 1) || (attributes === 1 && dense === 0) || (attributes === 2 && dense === 0) || (attributes === 3 && dense === 0))) { return false; }
  if (anchors < 64.0 || anchors > 256.0 || !Number.isFinite(anchors) || witnesses < 16.0 || witnesses > 2048.0 || !Number.isFinite(witnesses) || attributes < 0.0 || attributes > 3.0 || !Number.isFinite(attributes) || dense < 0.0 || dense > 1.0 || !Number.isFinite(dense) || ratio < 0.25 || ratio > 8.0 || !Number.isFinite(ratio)) { return false; }
  var baseline = witnesses > anchors * 2 && (!dense || anchors > 192 || witnesses > anchors * 4);
  return baseline && ratio <= 4;
}
