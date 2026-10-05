export function dispatchOverride(anchors, witnesses, attributes, dense, ratio) {
  if (!((attributes === 0 && dense === 1) || (attributes === 1 && dense === 0) || (attributes === 2 && dense === 0) || (attributes === 3 && dense === 0))) { return false; }
  if (!(witnesses > anchors * 2 && (!dense || anchors > 192 || witnesses > anchors * 4))) { return false; }
  if (anchors < 64.0 || anchors > 256.0 || !Number.isFinite(anchors) || witnesses < 16.0 || witnesses > 2048.0 || !Number.isFinite(witnesses) || attributes < 0.0 || attributes > 3.0 || !Number.isFinite(attributes) || dense < 0.0 || dense > 1.0 || !Number.isFinite(dense) || ratio < 0.25 || ratio > 8.0 || !Number.isFinite(ratio)) { return false; }
  var h0 = Math.max(0, 0.4972543703907728 + (-0.004327159272781922) * anchors + (-0.00018249016145902263) * witnesses + (0.4177094603818129) * (attributes >> 1) + (0.5602375188471422) * (attributes & 1) + (-0.38604010177579173) * dense + (-0.06233328269987419) * ratio);
  var h1 = Math.max(0, -1.66157140384616 + (-0.00010071612829494135) * anchors + (0.000663241086050421) * witnesses + (0.5550927857605235) * (attributes >> 1) + (0.5363294360978602) * (attributes & 1) + (-0.6845546076146388) * dense + (0.19518051552384943) * ratio);
  var h2 = Math.max(0, -0.2750167978570611 + (-8.417248221079802e-05) * anchors + (8.944477403345123e-05) * witnesses + (0.9014303587238316) * (attributes >> 1) + (0.008687062995623631) * (attributes & 1) + (-0.4145599243907711) * dense + (-0.012457797448447052) * ratio);
  var h3 = Math.max(0, 2.86283320357222 + (-0.004857924396034618) * anchors + (-0.0012252246870360557) * witnesses + (-1.1310000936067777) * (attributes >> 1) + (-0.7245715395509024) * (attributes & 1) + (1.3709354561457359) * dense + (-0.03966333028964654) * ratio);
  var value = 0.5574808716773987 + (-0.005638458766043186) * h0 + (-0.4266327917575836) * h1 + (-0.02287488989531994) * h2 + (0.3617955446243286) * h3;
  return Number.isFinite(value) && value > 0.25001;
}
