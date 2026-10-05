export function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {
  if (!((attributes === 0 && dense === 1) || (attributes === 1 && dense === 0) || (attributes === 2 && dense === 0) || (attributes === 3 && dense === 0))) { return false; }
  if (!(witnesses > anchors * 2 && (!dense || anchors > 192 || witnesses > anchors * 4))) { return false; }
  if (anchors < 64.0 || anchors > 256.0 || !Number.isFinite(anchors) || witnesses < 16.0 || witnesses > 2048.0 || !Number.isFinite(witnesses) || attributes < 0.0 || attributes > 3.0 || !Number.isFinite(attributes) || dense < 0.0 || dense > 1.0 || !Number.isFinite(dense) || ratio < 0.25 || ratio > 8.0 || !Number.isFinite(ratio)) { return false; }
  var h0 = 2.0751358631252277 + (0.00273340407144068) * anchors + (-0.000925386429572934) * witnesses + (-0.5524688426793406) * (attributes >> 1) + (-0.01759773084448102) * (attributes & 1) + (0.2700202077846348) * dense + (-0.25562892001957915) * ratio;
  var value = h0;
  return Number.isFinite(value) && value > 1e-05;
}
