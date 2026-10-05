export function score(anchors, witnesses, attributes, host) {
var x0 = (Math.log1p(anchors));
var x1 = (Math.log1p(witnesses));
var x2 = (attributes ? 1 : 0);
var x3 = (Math.log1p(witnesses / anchors));
var x4 = (0);
var x5 = (1);
var h0 = Math.tanh((((((((-0.5360549730213622)+(0.1429527230603199)*x0)+(0.021185954201957867)*x1)+(0.33536660768632126)*x2)+(0.1841263033000398)*x3)+(0)*x4)+(0)*x5));
var h1 = Math.tanh((((((((-0.335570025667872)+(0.16263595266460254)*x0)+(-0.2483343299294097)*x1)+(0.0708384608234357)*x2)+(-0.6689844867236671)*x3)+(0)*x4)+(0)*x5));
return (((-0.027707740664482117)+(0.44360170513391495)*h0)+(-0.07634064555168152)*h1);
}

export function chooseRoute(anchors, witnesses, attributes, dense, host) {
  var fallback = witnesses <= anchors * 2 ||
    (dense && anchors <= 192 && witnesses <= anchors * 4);
  if (!Number.isSafeInteger(anchors) || !Number.isSafeInteger(witnesses) ||
    anchors < 32 || anchors > 745 ||
    witnesses < 0 || witnesses > 2370 ||
    (attributes !== 0 && attributes !== 3) ||
    (host !== 'chromium' && host !== 'jsdom') ||
    witnesses < anchors * 0 || witnesses > anchors * 4.319148936170213) {
    return fallback;
  }
  var delta = score(anchors, witnesses, attributes, host);
  if (!Number.isFinite(delta) || Math.abs(delta) <= 0.100001) {
    return fallback;
  }
  return delta > 0;
}
