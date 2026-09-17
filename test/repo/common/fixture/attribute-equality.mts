export const markup =
  '<!doctype html><input id=i type=checkbox><div id=d data-k=TYPE></div><div id=e data-k=""></div><div id=m></div><svg id=svg viewBox="0 0 10 10" preserveAspectRatio="xMidYMid" class="logo"><g id=s data-k=TYPE></g></svg>'

export const svgCases: Array<[string, string[]]> = [
  ['svg[viewBox]', ['svg']],
  ['svg[viewBox="0 0 10 10"]', ['svg']],
  ['svg[viewBox="0 0 10 10" i]', ['svg']],
  ['svg[preserveAspectRatio="xMidYMid"]', ['svg']],
  ['svg[preserveAspectRatio="xmidymid" i]', ['svg']],
  ['svg[class="logo"]', ['svg']],
  ['svg[preserveAspectRatio="xmidymid"]', []],
]

export const cases: Array<[string, string[]]> = [
  ['input[type="CHECKBOX"]', ['i']],
  ['div[data-k="type"]', []],
  ['[data-k="TYPE"]', ['d', 's']],
  ['[data-k="type" i]', ['d', 's']],
  ['[data-k=""]', ['e']],
  ['[missing="null"]', []],
  ['[data-k="T\\59 PE"]', ['d', 's']],
  ['[data-k^="TY"]', ['d', 's']],
  ['[data-k$="PE"]', ['d', 's']],
  ['[data-k*="YP"]', ['d', 's']],
  ...svgCases,
]
