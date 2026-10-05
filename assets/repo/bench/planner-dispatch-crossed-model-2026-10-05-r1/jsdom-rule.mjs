export function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {
  if (!((attributes === 0 && dense === 1) || (attributes === 1 && dense === 0) || (attributes === 2 && dense === 0) || (attributes === 3 && dense === 0))) { return false; }
  if (anchors < 32.0 || anchors > 192.0 || !Number.isFinite(anchors) || witnesses < 80.0 || witnesses > 768.0 || !Number.isFinite(witnesses) || attributes < 0.0 || attributes > 3.0 || !Number.isFinite(attributes) || dense < 0.0 || dense > 1.0 || !Number.isFinite(dense) || ratio < 2.5 || ratio > 4.0 || !Number.isFinite(ratio)) { return false; }
  if (!(witnesses > anchors * 2 && (!dense || anchors > 192 || witnesses > anchors * 4))) { return false; }
  return (attributes === 1 && anchors <= 192 && ratio <= 4) || (attributes === 2 && anchors <= 192 && ratio <= 4) || (attributes === 3 && anchors <= 192 && ratio <= 4);
}
