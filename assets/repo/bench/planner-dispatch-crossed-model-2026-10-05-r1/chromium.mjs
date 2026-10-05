export function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {
  if (!((attributes === 0 && dense === 1) || (attributes === 1 && dense === 0) || (attributes === 2 && dense === 0) || (attributes === 3 && dense === 0))) { return false; }
  if (!(witnesses > anchors * 2 && (!dense || anchors > 192 || witnesses > anchors * 4))) { return false; }
  if (anchors < 32.0 || anchors > 192.0 || !Number.isFinite(anchors) || witnesses < 80.0 || witnesses > 768.0 || !Number.isFinite(witnesses) || attributes < 0.0 || attributes > 3.0 || !Number.isFinite(attributes) || dense < 0.0 || dense > 1.0 || !Number.isFinite(dense) || ratio < 2.5 || ratio > 4.0 || !Number.isFinite(ratio)) { return false; }
  var h0 = Math.max(0, 4.17953744832907 + (0.006445970393207164) * anchors + (-0.001237694714117135) * witnesses + (-1.6934969987790789) * (attributes >> 1) + (1.9987740403888223) * (attributes & 1) + (-0.28316059708595276) * dense + (-1.2101973692576091) * ratio);
  var h1 = Math.max(0, 2.597287748725064 + (0.009217632292722143) * anchors + (0.0025723836936285944) * witnesses + (-0.888835499375548) * (attributes >> 1) + (-1.3368763712854246) * (attributes & 1) + (0.05107470974326134) * dense + (-0.6854634284973145) * ratio);
  var h2 = Math.max(0, 1.9602088835128941 + (0.0016921339906772743) * anchors + (-0.0011679149315742931) * witnesses + (2.0679337313410158) * (attributes >> 1) + (-2.0143598606744537) * (attributes & 1) + (0.052165184170007706) * dense + (-0.38973840077718097) * ratio);
  var h3 = Math.max(0, 8.011757617079402 + (-0.012647065327815697) * anchors + (-0.0055700006392621825) * witnesses + (-2.1309548602481425) * (attributes >> 1) + (0.0638230346032306) * (attributes & 1) + (0.17864754796028137) * dense + (-0.8110613028208414) * ratio);
  var value = 1.018654465675354 + (0.8310559988021851) * h0 + (0.8028913736343384) * h1 + (0.6000171303749084) * h2 + (0.945857048034668) * h3;
  return Number.isFinite(value) && value > 3.00001;
}
