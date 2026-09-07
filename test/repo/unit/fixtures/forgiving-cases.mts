export const markup =
  '<!doctype html><body><div id="d" data-v="a,b"><p id="p" class="a,b">x</p></div><p id="q"></p>'
export const cases: Array<[string, string[]]> = [
  ['p:is(svg|p, p)', ['p', 'q']],
  ['div:is(svg|div, #d)', ['d']],
  [':where(svg|p, p)', ['p', 'q']],
  [':is(svg|p)', []],
  ['p:is(:unknown, #p)', ['p']],
  ['p:is(#p, :unknown)', ['p']],
  ['p:is(:unknown, :is(#p, #q))', ['p', 'q']],
  ['p:where(:unknown, :not(#q))', ['p']],
  ['div:is(:unknown, [data-v="a,b"])', ['d']],
  ["div:where(:unknown, [data-v='a,b'])", ['d']],
  ['p:is(:unknown, .a\\,b)', ['p']],
  ['div:not(:is(svg|div))', ['d']],
  ['div[data-v="a,b"], p:is(:unknown, #q)', ['d', 'q']],
  ['p:is(:unknown, #p), p:where(:unknown, #q)', ['p', 'q']],
  ['p:is(, #p,)', ['p']],
  ['p:is(:unknown)', []],
]
