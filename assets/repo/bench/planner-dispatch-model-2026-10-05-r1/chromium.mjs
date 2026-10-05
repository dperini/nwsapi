export function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {
  if ((attributes !== 0 && attributes !== 3) || (dense !== 0 && dense !== 1)) { return false; }
  if (anchors < 48.0 || anchors > 256.0 || !Number.isFinite(anchors) || witnesses < 6.0 || witnesses > 1024.0 || !Number.isFinite(witnesses) || attributes < 0.0 || attributes > 3.0 || !Number.isFinite(attributes) || dense < 0.0 || dense > 1.0 || !Number.isFinite(dense) || ratio < 0.125 || ratio > 4.0 || !Number.isFinite(ratio)) { return false; }
  var h0 = -0.4646928621321677 + (0.0005486095324158669) * anchors + (0.00025378311402340974) * witnesses + (-0.04823470115661621) * attributes + (-0.6306276321411133) * dense + (0.30016265376921625) * ratio;
  var value = h0;
  return Number.isFinite(value) && value > 0.50001;
}
