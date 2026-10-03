const broad =
  '<!doctype html><main>' +
  '<section class="card a b" data-a="one" data-b><span class="leaf"></span></section>'.repeat(
    256,
  ) +
  '</main>'
const deep =
  '<!doctype html><main>' +
  '<div class="card a">'.repeat(100) +
  '<i class="witness leaf"></i>' +
  '</div>'.repeat(100) +
  '</main>'
export const cases = [
  {
    name: 'shared class scans',
    selector: '.card[data-a], .card[data-b]',
    markup: broad,
  },
  {
    name: 'shared tag scans',
    selector: 'section[data-a], section[data-b]',
    markup: broad,
  },
  {
    name: 'complex logical predicates',
    selector: 'span:is(main > section > span, aside > span)',
    markup: broad,
  },
  {
    name: 'mixed backtracking miss',
    selector: '.missing .a > .a .a .leaf',
    markup: deep,
    match: true,
  },
  {
    name: 'mixed backtracking hit',
    selector: 'body .a > .a .a .leaf',
    markup: deep,
    match: true,
  },
  {
    name: 'sparse overlapping has',
    selector: '.card:has(.witness)',
    markup: deep,
  },
  {
    name: 'missing overlapping has',
    selector: '.card:has(.missing)',
    markup: deep,
  },
  { name: 'dense has control', selector: '.card:has(.leaf)', markup: broad },
  {
    name: 'small has control',
    selector: '.card:has(.leaf)',
    markup:
      '<!doctype html><section class="card"><i class="leaf"></i></section>',
  },
  {
    name: 'compound attribute reject',
    target: 'section',
    selector: 'section.missing[data-a="one"][data-b]',
    markup: broad,
    match: true,
  },
  { name: 'identity selection control', selector: '.card', markup: broad },
  {
    name: 'simple match control',
    target: 'section',
    selector: 'section.card',
    markup: broad,
    match: true,
  },
]
