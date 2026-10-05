export function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {
  if ((attributes !== 0 && attributes !== 3) || (dense !== 0 && dense !== 1)) { return false; }
  if (anchors < 48.0 || anchors > 256.0 || !Number.isFinite(anchors) || witnesses < 6.0 || witnesses > 1024.0 || !Number.isFinite(witnesses) || attributes < 0.0 || attributes > 3.0 || !Number.isFinite(attributes) || dense < 0.0 || dense > 1.0 || !Number.isFinite(dense) || ratio < 0.125 || ratio > 4.0 || !Number.isFinite(ratio)) { return false; }
  var h0 = -0.7595966141208357 + (0.004110028537420126) * anchors + (0.00023364622053985274) * witnesses + (-0.027575023472309113) * attributes + (0.0835050493478775) * dense + (0.10980014647206952) * ratio;
  var value = h0;
  return Number.isFinite(value) && value > 1.00001;
}
