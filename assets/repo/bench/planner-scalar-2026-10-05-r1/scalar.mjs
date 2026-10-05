export function score(anchors, witnesses, attributes, host) {
var x0 = ((Math.log1p(anchors)) - (4.42778697001435)) / (0.920248581213983);
var x1 = ((Math.log1p(witnesses)) - (3.2866873888150776)) / (2.3675609148892773);
var x2 = ((attributes ? 1 : 0) - (0.48)) / (0.49959983987187156);
var x3 = ((Math.log1p(witnesses / anchors)) - (0.6429266214559867)) / (0.6509618753434508);
var x4 = ((host === 'chromium' ? 1 : 0) - (0.5)) / (0.5);
var x5 = ((host === 'jsdom' ? 1 : 0) - (0.5)) / (0.5);
var h0 = Math.tanh((((((((0.4084305167198181)+(0.13155204057693481)*x0)+(0.0501590371131897)*x1)+(0.16754910349845886)*x2)+(0.11985920369625092)*x3)+(0.11094305664300919)*x4)+(0.14840905368328094)*x5));
var h1 = Math.tanh((((((((-0.10301009565591812)+(0.14966550469398499)*x0)+(-0.5879466533660889)*x1)+(0.035390883684158325)*x2)+(-0.4354833960533142)*x3)+(0.28479352593421936)*x4)+(-0.4399518370628357)*x5));
var forward = (((0.21656163036823273)+(0.5257123708724976)*h0)+(-0.42843765020370483)*h1);
var inverse = (((0.24426937103271484)+(0.08211066573858261)*h0)+(-0.3520970046520233)*h1);
return forward - inverse;
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
