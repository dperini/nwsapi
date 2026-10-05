// Experimental has planner. Not imported by the production runtime.
export function chooseInverse(anchors, witnesses, attributes) {
  return ((attributes === 0 || attributes === 3) && anchors >= 32 && anchors <= 745 && witnesses >= 0 && witnesses <= 2370 && (witnesses / anchors) >= 0 && (witnesses / anchors) <= 4.319148936170213) ? true : (witnesses <= anchors * 2)
}
