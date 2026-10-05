export function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {
  if ((attributes !== 0 && attributes !== 3) || (dense !== 0 && dense !== 1)) { return false; }
  if (anchors < 48.0 || anchors > 256.0 || !Number.isFinite(anchors) || witnesses < 6.0 || witnesses > 1024.0 || !Number.isFinite(witnesses) || attributes < 0.0 || attributes > 3.0 || !Number.isFinite(attributes) || dense < 0.0 || dense > 1.0 || !Number.isFinite(dense) || ratio < 0.125 || ratio > 4.0 || !Number.isFinite(ratio)) { return false; }
  var baseline = ratio > 2 && (!dense || anchors > 192 || ratio > 4);
  return (ratio > 4) !== baseline;
}
